@echo off
title Kantor AI - Koperasi Merdeka Resberg
rem Klik dua kali file ini untuk menyalakan kantor. Tutup jendela hitam ini untuk mematikannya.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js belum terpasang. Unduh dari https://nodejs.org lalu buka file ini lagi. & pause & exit /b 1)
if not exist node_modules (echo Memasang bahan kantor, sekali saja... & call npm install || (pause & exit /b 1))
if not exist "konten\masuk" mkdir "konten\masuk"
echo.
echo Kantor AI menyala dan terbuka di browser.
echo Biarkan jendela ini terbuka selama memakai kantor. Tutup jendela ini untuk mematikan kantor.
echo Video baru: taruh di folder konten\masuk
echo.
call npm run dev -- --open
pause
