#!/bin/bash
source /opt/lab/lib.sh
# 1) arquivo em sudoers.d que menciona o grupo
cand=$(grep -l -F "%$P_grupo" /etc/sudoers.d/* 2>/dev/null)
if [ -z "$cand" ]; then
  fail "nenhum arquivo em /etc/sudoers.d/ contém uma regra para %$P_grupo"
  finish; exit
fi
f=""
for c in $cand; do
  b=$(basename "$c")
  if printf '%s' "$b" | grep -Eq '^[A-Za-z0-9_-]+$'; then f=$c; break; fi
done
if [ -z "$f" ]; then
  fail "o(s) arquivo(s) ($(for c in $cand; do basename "$c"; done | tr '\n' ' ')) têm nome que o sudo ignora (sem ponto e sem terminar em ~)"
  finish; exit
fi
ok "o arquivo /etc/sudoers.d/$(basename "$f") tem nome aceito pelo sudo"
expect_eq "dono:grupo do arquivo = root:root" "$(stat -c %U:%G "$f")" "root:root"
expect_eq "modo do arquivo = 440" "$(stat -c %a "$f")" "440"
if visudo -cf "$f" >/dev/null 2>&1; then ok "visudo -cf aceita a sintaxe do arquivo"; else fail "visudo -cf acusa erro de sintaxe no arquivo"; fi
if visudo -c >/dev/null 2>&1; then ok "visudo -c valida toda a configuração do sudo"; else fail "visudo -c reporta problema na configuração (sintaxe, dono ou modo)"; fi
# 2) efeito real: sudo -l -U
export CMD_A=$P_cmd_a CMD_B=$P_cmd_b
for u in "$P_m1" "$P_m2"; do
  out=$(LC_ALL=C sudo -l -U "$u" 2>/dev/null)
  res=$(printf '%s\n' "$out" | python3 -c '
import os, re, sys
a, b = os.environ["CMD_A"], os.environ["CMD_B"]
txt = sys.stdin.read()
if "may run the following commands" not in txt:
    print("sem-permissao"); sys.exit()
body = txt.split("may run the following commands", 1)[1].split("\n", 1)[1]
cmds = {}
for line in body.splitlines():
    m = re.match(r"^\s*\(([^)]*)\)\s*(.*)$", line)
    if not m:
        continue
    runas, rest = m.group(1), m.group(2)
    if runas.replace(" ", "") not in ("root", "ALL", "ALL:ALL", "root:ALL", "root:root"):
        print("runas-estranho:" + runas); sys.exit()
    nopw = False
    for tok in [t.strip() for t in rest.split(", ")]:
        while True:
            mm = re.match(r"^([A-Z_]+):\s*(.*)$", tok)
            if not mm:
                break
            tag, tok = mm.group(1), mm.group(2)
            if tag == "NOPASSWD": nopw = True
            elif tag == "PASSWD": nopw = False
        cmds[tok] = nopw
extra = sorted(set(cmds) - {a, b})
if extra:
    print("extra:" + ",".join(extra)); sys.exit()
st = []
st.append("a-ok" if cmds.get(a) is True else ("a-pede-senha" if a in cmds else "a-ausente"))
st.append("b-ok" if cmds.get(b) is False else ("b-sem-senha" if b in cmds else "b-ausente"))
print(" ".join(st))
')
  case "$res" in
    "a-ok b-ok") ok "$u: $P_cmd_a sem senha e $P_cmd_b com senha, como root, e nada além disso";;
    sem-permissao) fail "$u não tem nenhuma permissão de sudo (a regra do grupo não está valendo)";;
    extra:*) fail "$u tem permissões além das pedidas (${res#extra:})";;
    runas-estranho:*) fail "$u: a regra roda comandos como outro usuário (${res#runas-estranho:}), mas deveria ser root";;
    *) fail "$u: situação dos comandos incorreta ($res) — esperado: $P_cmd_a NOPASSWD e $P_cmd_b exigindo senha";;
  esac
done
out=$(LC_ALL=C sudo -l -U "$P_fora" 2>&1)
if printf '%s\n' "$out" | grep -q "is not allowed to run sudo"; then ok "$P_fora continua sem permissão de sudo"; else fail "$P_fora ganhou permissões de sudo, mas não deveria"; fi
finish
