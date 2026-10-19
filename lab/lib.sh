# Funções auxiliares para setup.sh / check.sh / solve.sh dos desafios (use: source /opt/lab/lib.sh).
# Os scripts rodam como root dentro do container; o aluno trabalha como usuário "aluno".
# Parâmetros sorteados chegam como P_<nome> (ex.: $P_usuario). Saída de check: linhas "OK|msg" ou "FALHA|msg".

LAB_DIR=${LAB_DIR:-/home/aluno/lab}
export LC_ALL=C
_FAILS=0

# ---- check.sh ----
ok()   { echo "OK|$*"; }
fail() { echo "FALHA|$*"; _FAILS=$((_FAILS + 1)); }
# expect "mensagem" comando args...   -> OK se o comando retornar 0
expect() { local msg=$1; shift; if "$@" >/dev/null 2>&1; then ok "$msg"; else fail "$msg"; fi; }
# expect_eq "mensagem" "obtido" "esperado"
expect_eq() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (esperado: '$3', obtido: '$2')"; fi; }
finish() { [ "$_FAILS" -eq 0 ]; }

# ---- setup.sh ----
# Recria a pasta do exercício em ~aluno/lab/<nome>, pertencente ao aluno.
fresh_dir() { rm -rf "$LAB_DIR/$1"; mkdir -p "$LAB_DIR/$1"; chown aluno:aluno "$LAB_DIR" "$LAB_DIR/$1"; echo "$LAB_DIR/$1"; }
# Executa como aluno (login limpo).
as_aluno() { su -s /bin/bash aluno -c "$*"; }
# Remove usuário/grupo se existirem (idempotência).
drop_user()  { id "$1" >/dev/null 2>&1 && userdel -r -f "$1" >/dev/null 2>&1; true; }
drop_group() { getent group "$1" >/dev/null && groupdel "$1" >/dev/null 2>&1; true; }
