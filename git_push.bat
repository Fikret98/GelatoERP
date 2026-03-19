@echo off
git status > git_status.txt
git add .
git commit -m "fix(shift): resolved double discrepancy verification bug & enhanced HR admin UI" >> git_status.txt 2>&1
git push >> git_status.txt 2>&1
git status >> git_status.txt
