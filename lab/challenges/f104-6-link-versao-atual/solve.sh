#!/bin/bash
source /opt/lab/lib.sh
a=$LAB_DIR/releases/$P_app
cd "$a" || exit 1
ln -sfn "versoes/$P_nova" atual
ln -s "$a/atual/bin/$P_app" comando
find . -xtype l -delete
chown -R -h aluno:aluno "$a"
