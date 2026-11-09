# E-05: gabarito e manifesto do material em estado privado; apagar/alterar o material não pode ser aprovado.
ID=f104-6-classificar-links
P=(base=estoque)
D=/home/aluno/lab/auditoria
lab_setup; chk FAIL "estado inicial (cenário não nasce resolvido)"
lab_solve; chk PASS "solução (solve.sh)"
# só o original + três respostas vazias
lab_setup
find $D -mindepth 1 ! -name 'estoque.dat' -delete 2>/dev/null; rm -rf $D/sub
: > $D/duros.txt; : > $D/simbolicos.txt; : > $D/copias.txt
chk FAIL "ADVERSARIAL: material apagado; só o original e três respostas vazias"
# apagar só o link quebrado
lab_setup; lab_solve
quebrado=$(cd $D && find . -xtype l | head -1)
rm -f "$D/$quebrado"
(cd $D && find . -type l | sed 's|^\./||' > simbolicos.txt)
chk FAIL "ADVERSARIAL: link quebrado removido e fora da lista"
# respostas com ./, espaços no fim e ordem embaralhada
lab_setup; lab_solve
for f in duros simbolicos copias; do sed 's|^|./|; s|$|  |' $D/$f.txt | shuf > /tmp/x.txt; cp /tmp/x.txt $D/$f.txt; done
chown aluno:aluno $D/*.txt
chk PASS "listas embaralhadas, com './' e espaços no fim"
lab_setup; lab_solve
echo anotacao > $D/rascunho.txt; chown aluno:aluno $D/rascunho.txt
chk PASS "arquivo auxiliar do aluno na pasta"
lab_setup; lab_solve
ln -f $D/estoque.dat "$D/$(head -1 $D/copias.txt)"
chk FAIL "uma cópia substituída por hardlink do original"
lab_setup; lab_solve
h=$(head -1 $D/duros.txt); rm -f "$D/$h"; cp $D/estoque.dat "$D/$h"
chk FAIL "um hardlink substituído por cópia"
lab_setup; lab_solve
isca=$(cd $D && find . -type f -name '*.dat' ! -samefile estoque.dat | while read -r f; do cmp -s estoque.dat "$f" || echo "${f#./}"; done | head -1)
echo mexido >> "$D/$isca"
chk FAIL "arquivo-isca modificado"
lab_setup; lab_solve
s=$(head -1 $D/simbolicos.txt); rm -f "$D/$s"; ln -s /etc/hostname "$D/$s"
chk FAIL "symlink apontando para outro destino"
P=(base=folha)
lab_setup; chk FAIL "[folha] estado inicial"; lab_solve; chk PASS "[folha] solução"
