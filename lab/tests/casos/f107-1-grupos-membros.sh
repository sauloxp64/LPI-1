# E-06: quem tem o grupo-alvo como grupo PRIMÁRIO também é membro (não aparece no 4º campo de /etc/group).
ID=f107-1-grupos-membros
P=(grupo=projeto-atlas antigo=piloto-atlas gid=4200 m1=lucio m2=marta m3=nilson m4=olivia ex1=vpn-lab ex2=docs-lab)
lab_setup;                     chk FAIL "estado inicial (cenário não nasce resolvido)"
lab_solve;                     chk PASS "solução (solve.sh)"
usermod -g projeto-atlas olivia;  chk FAIL "ADVERSARIAL: usermod -g projeto-atlas olivia (m4 volta ao grupo pelo grupo primário)"
lab_setup; lab_solve
gpasswd -d nilson projeto-atlas >/dev/null; usermod -g projeto-atlas nilson
chk PASS "m3 esperado associado só pelo grupo primário (conta como membro)"
lab_setup; lab_solve
useradd -M -s /usr/sbin/nologin -g projeto-atlas intruso
chk FAIL "conta extra com o grupo-alvo como grupo primário"
userdel intruso 2>/dev/null
lab_setup; lab_solve
gpasswd -a olivia projeto-atlas >/dev/null;   chk FAIL "m4 de volta como membro suplementar"
lab_setup; lab_solve
gpasswd -d marta projeto-atlas >/dev/null;    chk FAIL "m2 removido do grupo"
lab_setup
