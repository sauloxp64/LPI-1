"""Analisador dos campos de tempo do cron (semântica do cron do Debian / Vixie), compartilhado pelos checks
f107-2-cron-aluno e f107-2-cron-d-sistema (achado E-01).

Por que não basta comparar conjuntos: no cron do Debian, se o campo do dia do mês OU o do dia da semana
COMEÇA com '*', os dois são combinados com E; se nenhum começa com '*', basta casar um dos dois (OU).
Então `10 3 1-31 * 1` roda TODO dia (OU), enquanto `10 3 */1 * 1` roda só às segundas (E).
Este módulo guarda os conjuntos E a informação do curinga, e calcula o calendário efetivo.
"""
import re
from collections import namedtuple

MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
DOW = {d: i for i, d in enumerate("sun mon tue wed thu fri sat".split())}

Tempo = namedtuple('Tempo', 'mi ho dm mo dw dm_star dw_star')


class CronErro(ValueError):
    pass


def _num(x, names, lo, hi):
    x = x.lower()
    if x in names:
        v = names[x]
    elif re.fullmatch(r'[0-9]+', x):
        v = int(x)
    else:
        raise CronErro(f"valor inválido: {x!r}")
    if not lo <= v <= hi:
        raise CronErro(f"valor fora de {lo}-{hi}: {x!r}")
    return v


def expand(field, lo, hi, names=None):
    """Conjunto de valores de um campo (listas, intervalos a-b, '*', passos /n); levanta CronErro se inválido."""
    names = names or {}
    out = set()
    for part in field.split(','):
        step = 1
        passo = False
        if '/' in part:
            part, s = part.split('/', 1)
            if not re.fullmatch(r'[0-9]+', s) or int(s) < 1:
                raise CronErro(f"passo inválido: {s!r}")
            step = int(s)
            passo = True
        if part == '*':
            a, b = lo, hi
        elif '-' in part:
            x, y = part.split('-', 1)
            a, b = _num(x, names, lo, hi), _num(y, names, lo, hi)
            if a > b:
                raise CronErro(f"intervalo invertido: {part!r}")
        else:
            if passo:  # no cron, "5/15" é erro de sintaxe: o passo só vale com '*' ou com um intervalo
                raise CronErro(f"passo sem intervalo: {part!r}")
            a = b = _num(part, names, lo, hi)
        out |= set(range(a, b + 1, step))
    if not out:
        raise CronErro("campo vazio")
    return out


def parse_tempo(f):
    """f = os 5 campos de tempo (lista de strings). Devolve Tempo ou levanta CronErro."""
    if len(f) != 5:
        raise CronErro("são necessários 5 campos de tempo")
    return Tempo(
        expand(f[0], 0, 59), expand(f[1], 0, 23), expand(f[2], 1, 31), expand(f[3], 1, 12, MON),
        {0 if v == 7 else v for v in expand(f[4], 0, 7, DOW)},
        f[2].startswith('*'), f[4].startswith('*'),
    )


def tempo_esperado(mi, ho, dm, mo, dw, dm_star, dw_star):
    """Monta um Tempo a partir de conjuntos esperados; *_star diz se o campo é um curinga '*'."""
    return Tempo(set(mi), set(ho), set(dm), set(mo), {0 if v == 7 else v for v in dw}, dm_star, dw_star)


def calendario(t):
    """Conjunto de (mês, dia do mês, dia da semana 0-6) em que a linha roda, pela regra do cron do Debian."""
    e = bool(t.dm_star or t.dw_star)
    return frozenset(
        (m, d, w)
        for m in t.mo for d in range(1, 32) for w in range(7)
        if ((d in t.dm and w in t.dw) if e else (d in t.dm or w in t.dw))
    )


def mesmo_calendario(a, b):
    return calendario(a) == calendario(b)
