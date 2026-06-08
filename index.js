/*
 * index.js — Единый исходный файл: Telegram-бот + Mini-App (плеер в стиле Spotify).
 *
 * Запуск:  node index.js
 * Конфиг:  .env (см. .env.example)
 *
 * Источник музыки: YouTube Music (поиск + полные аудио-потоки, без 30-сек превью).
 * Синхронизированный текст: lrclib.net (авто-подгрузка по тайм-кодам).
 * Хранение: SQLite (better-sqlite3).
 */

"use strict";

const path = require("path");
const crypto = require("crypto");
const http = require("http");
require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const { Telegraf, Markup } = require("telegraf");
const ytdl = require("@distube/ytdl-core");

// ===================================================================
//  ФРОНТЕНД MINI-APP (встроен HTML + CSS + JS)
//  ВНИМАНИЕ: внутри этого template-literal клиентский JS намеренно
//  не использует бэктики и ${...}, чтобы не ломать обёртку.
// ===================================================================
const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>Dreinnify</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0a0a0a; --bg2:#121212; --elev:#181818; --elev2:#242424;
  --text:#ffffff; --muted:#b3b3b3; --accent:#1db954; --accent2:#1ed760;
  --author:#8b5cf6; --verify:#3897f0; --danger:#e0245e;
  --radius:14px; --nav-h:64px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;height:100%;}
body{
  font-family:'Manrope',system-ui,sans-serif;
  background:var(--bg); color:var(--text);
  overflow:hidden; font-size:15px;
}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
input,textarea{font-family:inherit;}
img{display:block;}
a{color:var(--accent);}

#app{display:flex; height:100vh; height:100dvh; width:100%;}

/* ── БОКОВОЕ МЕНЮ (ПК) ── */
#sidebar{
  width:240px; flex:0 0 240px; background:#000; padding:22px 12px;
  display:flex; flex-direction:column; gap:6px;
}
#sidebar .logo{font-weight:800;font-size:22px;padding:8px 12px 18px;letter-spacing:.5px;}
#sidebar .logo span{color:var(--accent);}
.navbtn{
  display:flex;align-items:center;gap:14px;padding:11px 12px;border-radius:8px;
  color:var(--muted);font-weight:700;font-size:15px;width:100%;text-align:left;
}
.navbtn.active,.navbtn:hover{color:var(--text);background:var(--elev2);}
.navbtn svg{width:22px;height:22px;flex:0 0 22px;}

/* ── ОСНОВНАЯ ОБЛАСТЬ ── */
#main{flex:1; min-width:0; display:flex; flex-direction:column;
  background:linear-gradient(180deg,#1f1f1f 0%, var(--bg) 220px);}
#scroll{flex:1; overflow-y:auto; padding:18px 22px 150px; scroll-behavior:smooth;}
#scroll::-webkit-scrollbar{width:10px;}#scroll::-webkit-scrollbar-thumb{background:#333;border-radius:6px;}

.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;}
.topbar h1{font-size:26px;font-weight:800;margin:0;}
.searchbox{flex:1;max-width:420px;}
.searchbox input{width:100%;padding:12px 16px;border-radius:24px;background:var(--elev2);
  color:var(--text);border:none;font-size:15px;font-weight:600;outline:none;}
.avatarbtn{width:38px;height:38px;border-radius:50%;overflow:hidden;background:var(--elev2);flex:0 0 38px;}
.avatarbtn img{width:100%;height:100%;object-fit:cover;}

/* ── ПРОМО «ВЫБРАНО РЕДАКЦИЕЙ» ── */
.promo{position:relative;border-radius:18px;overflow:hidden;margin-bottom:28px;
  min-height:230px;display:flex;align-items:flex-end;padding:26px;
  background:linear-gradient(120deg,#3a1c71,#5b2a86 40%,#1db954 130%);}
.promo .promo-cover{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.45;}
.promo .promo-grad{position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.75));}
.promo .promo-in{position:relative;z-index:2;}
.promo .badge{display:inline-block;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);
  padding:6px 12px;border-radius:20px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;}
.promo h2{margin:0 0 4px;font-size:32px;font-weight:800;line-height:1.1;}
.promo p{margin:0 0 16px;color:#e9e9e9;font-weight:600;}
.promo .playbig{display:inline-flex;align-items:center;gap:9px;background:var(--accent);color:#000;
  font-weight:800;padding:12px 22px;border-radius:30px;font-size:15px;}
.promo .playbig:hover{background:var(--accent2);transform:scale(1.03);}

.section-title{font-size:21px;font-weight:800;margin:22px 0 14px;}

/* ── СЕТКА КАРТОЧЕК ── */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:18px;}
.card{background:var(--elev);border-radius:var(--radius);padding:14px;transition:.2s;cursor:pointer;position:relative;}
.card:hover{background:var(--elev2);}
.card .cover{width:100%;aspect-ratio:1/1;border-radius:10px;object-fit:cover;background:#333;margin-bottom:12px;box-shadow:0 8px 22px rgba(0,0,0,.45);}
.card .ctitle{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.card .csub{color:var(--muted);font-size:13px;font-weight:600;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.card .cplay{position:absolute;right:22px;bottom:64px;width:46px;height:46px;border-radius:50%;
  background:var(--accent);color:#000;display:flex;align-items:center;justify-content:center;
  opacity:0;transform:translateY(8px);transition:.2s;box-shadow:0 8px 18px rgba(0,0,0,.5);}
.card:hover .cplay{opacity:1;transform:translateY(0);}

/* ── СПИСОК ТРЕКОВ ── */
.tracklist{display:flex;flex-direction:column;}
.trow{display:flex;align-items:center;gap:14px;padding:9px 10px;border-radius:9px;cursor:pointer;}
.trow:hover{background:var(--elev2);}
.trow .tn{width:22px;text-align:center;color:var(--muted);font-weight:700;flex:0 0 22px;font-size:14px;}
.trow .tcover{width:46px;height:46px;border-radius:7px;object-fit:cover;background:#333;flex:0 0 46px;}
.trow .tmeta{flex:1;min-width:0;}
.trow .tt{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.trow .ta{color:var(--muted);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.trow .tdur{color:var(--muted);font-size:13px;font-weight:600;}
.trow .ticon{color:var(--muted);width:20px;height:20px;}
.trow.playing .tt{color:var(--accent);}
.feat{color:var(--muted);font-weight:600;}

.empty{color:var(--muted);text-align:center;padding:50px 10px;font-weight:600;}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--elev2);padding:7px 14px;border-radius:20px;font-weight:700;font-size:13px;margin:0 8px 8px 0;}
.chip.active{background:var(--text);color:#000;}

/* ── МИНИ-ПЛЕЕР ── */
#miniplayer{position:fixed;left:0;right:0;bottom:0;z-index:40;display:none;
  background:var(--elev2);border-top:1px solid #000;padding:10px 16px;align-items:center;gap:14px;}
#miniplayer.show{display:flex;}
#miniplayer .mp-cover{width:50px;height:50px;border-radius:8px;object-fit:cover;background:#333;flex:0 0 50px;}
#miniplayer .mp-meta{flex:1;min-width:0;cursor:pointer;}
#miniplayer .mp-t{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#miniplayer .mp-a{color:var(--muted);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#miniplayer .mp-ctrl{display:flex;align-items:center;gap:8px;}
.iconbtn{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text);}
.iconbtn:hover{background:rgba(255,255,255,.08);}
.iconbtn svg{width:24px;height:24px;}
.playpause{background:var(--text);color:#000;width:44px;height:44px;}
.playpause:hover{transform:scale(1.06);background:#fff;}
.mp-bar{position:absolute;left:0;right:0;top:0;height:3px;background:#000;}
.mp-bar .fill{height:100%;background:var(--accent);width:0%;}
.liked{color:var(--accent)!important;}

/* ── ПОЛНЫЙ ПЛЕЕР ── */
#player{position:fixed;inset:0;z-index:60;background:linear-gradient(180deg,#2a2a2a,#0a0a0a 60%);
  display:none;flex-direction:column;padding:20px;overflow-y:auto;}
#player.show{display:flex;}
#player .pl-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
#player .pl-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;max-width:640px;margin:0 auto;width:100%;}
#player .pl-cover{width:min(70vw,360px);aspect-ratio:1/1;border-radius:16px;object-fit:cover;
  background:#333;box-shadow:0 20px 60px rgba(0,0,0,.6);}
#player .pl-info{width:100%;text-align:left;}
#player .pl-title{font-size:24px;font-weight:800;}
#player .pl-artist{color:var(--muted);font-weight:600;margin-top:4px;font-size:16px;}
#player .pl-prog{width:100%;}
#player .seek{width:100%;height:6px;border-radius:4px;background:#5a5a5a;position:relative;cursor:pointer;margin:6px 0;}
#player .seek .sf{height:100%;background:var(--accent);border-radius:4px;width:0%;}
#player .times{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;font-weight:600;}
#player .pl-ctrl{display:flex;align-items:center;justify-content:center;gap:18px;}
#player .pl-ctrl .playpause{width:62px;height:62px;}
#player .pl-ctrl .playpause svg{width:30px;height:30px;}
#player .pl-actions{display:flex;align-items:center;justify-content:space-between;width:100%;}
.btn{background:var(--elev2);padding:10px 16px;border-radius:24px;font-weight:700;display:inline-flex;align-items:center;gap:8px;}
.btn:hover{background:#333;}
.btn.green{background:var(--accent);color:#000;}
.btn.green:hover{background:var(--accent2);}

/* ── КАРАОКЕ ── */
#karaoke{position:fixed;inset:0;z-index:70;background:linear-gradient(180deg,#1a1430,#0a0a0a);display:none;flex-direction:column;padding:18px;}
#karaoke.show{display:flex;}
#karaoke .kh{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
#karaoke .klines{flex:1;overflow-y:auto;text-align:center;padding:30vh 10px;scroll-behavior:smooth;}
#karaoke .klines::-webkit-scrollbar{display:none;}
.kline{font-size:23px;font-weight:800;color:#6b6b6b;padding:11px 0;transition:.35s;line-height:1.25;}
.kline.active{color:#fff;transform:scale(1.04);text-shadow:0 0 22px rgba(29,185,84,.5);}
.kline.passed{color:#4a4a4a;}

/* ── НИЖНЕЕ МЕНЮ (мобильные) ── */
#bottomnav{display:none;position:fixed;left:0;right:0;bottom:0;z-index:50;height:var(--nav-h);
  background:#0d0d0d;border-top:1px solid #1f1f1f;justify-content:space-around;align-items:center;
  padding-bottom:env(safe-area-inset-bottom);}
#bottomnav .bn{display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--muted);font-size:10px;font-weight:700;flex:1;padding:6px 0;}
#bottomnav .bn.active{color:var(--text);}
#bottomnav .bn svg{width:24px;height:24px;}

/* ── МОДАЛЬНЫЕ ОКНА ── */
.overlay{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:18px;}
.overlay.show{display:flex;}
.modal{background:var(--elev);border-radius:16px;padding:22px;width:100%;max-width:460px;max-height:86vh;overflow-y:auto;}
.modal h3{margin:0 0 16px;font-size:20px;font-weight:800;}
.modal label{display:block;font-weight:700;font-size:13px;color:var(--muted);margin:14px 0 6px;}
.modal input[type=text],.modal textarea{width:100%;padding:11px 13px;border-radius:9px;background:var(--elev2);color:var(--text);border:1px solid #333;outline:none;font-size:14px;}
.modal textarea{resize:vertical;min-height:70px;}
.modal .row{display:flex;gap:10px;margin-top:18px;}
.modal .row .btn{flex:1;justify-content:center;}
.crit{margin:12px 0;}
.crit .clab{display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-bottom:5px;}
.crit .cval{color:var(--accent);}
.crit input[type=range]{width:100%;accent-color:var(--accent);}
.crit .cdesc{color:var(--muted);font-size:12px;font-weight:600;margin-top:3px;}
.scorebig{font-size:30px;font-weight:800;color:var(--accent);text-align:center;margin:8px 0;}

.badge-v{display:inline-flex;width:18px;height:18px;vertical-align:middle;color:var(--verify);margin-left:5px;}
.badge-a{display:inline-flex;width:20px;height:20px;vertical-align:middle;align-items:center;justify-content:center;
  background:var(--author);border-radius:50%;margin-left:5px;color:#fff;}
.badge-a svg{width:12px;height:12px;}

.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#fff;color:#000;
  padding:11px 20px;border-radius:24px;font-weight:700;z-index:120;opacity:0;transition:.3s;pointer-events:none;font-size:14px;}
.toast.show{opacity:1;}

.profhead{display:flex;align-items:center;gap:20px;margin-bottom:22px;flex-wrap:wrap;}
.profhead .pa{width:120px;height:120px;border-radius:50%;object-fit:cover;background:var(--elev2);}
.profhead .pn{font-size:30px;font-weight:800;}
.profhead .pb{color:var(--muted);font-weight:600;margin-top:6px;max-width:480px;}
.statline{color:var(--muted);font-weight:700;margin-top:8px;}

.review{background:var(--elev);border-radius:12px;padding:14px;margin-bottom:12px;}
.review .rh{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.review .rscore{font-weight:800;color:var(--accent);}
.review .rtext{color:#ddd;font-weight:500;line-height:1.4;}
.review .rcrit{color:var(--muted);font-size:12px;font-weight:600;margin-top:6px;}

@media (max-width:820px){
  #sidebar{display:none;}
  #main{background:linear-gradient(180deg,#1f1f1f 0%, var(--bg) 180px);}
  #scroll{padding:16px 16px 200px;}
  #bottomnav{display:flex;}
  #miniplayer{bottom:var(--nav-h);border-radius:10px;left:8px;right:8px;margin-bottom:6px;border:none;}
  .topbar h1{font-size:22px;}
  .promo{min-height:200px;}
  .promo h2{font-size:26px;}
}
</style>
</head>
<body>
<div id="app">
  <nav id="sidebar">
    <div class="logo">Drein<span>nify</span></div>
    <button class="navbtn" data-v="home" onclick="go('home')">__IC_HOME__<span>Главная</span></button>
    <button class="navbtn" data-v="search" onclick="go('search')">__IC_SEARCH__<span>Поиск</span></button>
    <button class="navbtn" data-v="library" onclick="go('library')">__IC_LIB__<span>Медиатека</span></button>
    <button class="navbtn" data-v="profile" onclick="go('profile')">__IC_USER__<span>Профиль</span></button>
    <button class="navbtn" data-v="settings" onclick="go('settings')">__IC_GEAR__<span>Настройки</span></button>
    <button class="navbtn" id="nav-admin" data-v="admin" onclick="go('admin')" style="display:none">__IC_SHIELD__<span>Админ</span></button>
  </nav>
  <div id="main">
    <div id="scroll"><div class="empty">Загрузка…</div></div>
  </div>
</div>

<div id="miniplayer">
  <div class="mp-bar"><div class="fill" id="mp-fill"></div></div>
  <img class="mp-cover" id="mp-cover" alt="">
  <div class="mp-meta" onclick="openPlayer()">
    <div class="mp-t" id="mp-t"></div>
    <div class="mp-a" id="mp-a"></div>
  </div>
  <div class="mp-ctrl">
    <button class="iconbtn" id="mp-like" onclick="toggleLikeCurrent(event)">__IC_HEART__</button>
    <button class="iconbtn" onclick="prevTrack()">__IC_PREV__</button>
    <button class="iconbtn playpause" id="mp-pp" onclick="togglePlay()">__IC_PLAY__</button>
    <button class="iconbtn" onclick="nextTrack()">__IC_NEXT__</button>
  </div>
</div>

<div id="player">
  <div class="pl-top">
    <button class="iconbtn" onclick="closePlayer()">__IC_DOWN__</button>
    <div style="font-weight:800;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Сейчас играет</div>
    <button class="iconbtn" id="pl-review" onclick="openReview()">__IC_STAR__</button>
  </div>
  <div class="pl-stage">
    <img class="pl-cover" id="pl-cover" alt="">
    <div class="pl-info">
      <div class="pl-title" id="pl-title"></div>
      <div class="pl-artist" id="pl-artist"></div>
    </div>
    <div class="pl-prog">
      <div class="seek" id="pl-seek"><div class="sf" id="pl-seekfill"></div></div>
      <div class="times"><span id="pl-cur">0:00</span><span id="pl-dur">0:00</span></div>
    </div>
    <div class="pl-ctrl">
      <button class="iconbtn" id="pl-like" onclick="toggleLikeCurrent(event)">__IC_HEART__</button>
      <button class="iconbtn" onclick="prevTrack()">__IC_PREV__</button>
      <button class="iconbtn playpause" id="pl-pp" onclick="togglePlay()">__IC_PLAY__</button>
      <button class="iconbtn" onclick="nextTrack()">__IC_NEXT__</button>
      <button class="iconbtn" id="pl-add" onclick="openAddPlaylist()">__IC_PLUS__</button>
    </div>
    <div class="pl-actions">
      <button class="btn" onclick="openKaraoke()">__IC_MIC__<span>Синхронизированный текст</span></button>
    </div>
  </div>
</div>

<div id="karaoke">
  <div class="kh">
    <button class="iconbtn" onclick="closeKaraoke()">__IC_DOWN__</button>
    <div style="font-weight:800" id="k-title"></div>
    <button class="iconbtn playpause" id="k-pp" onclick="togglePlay()">__IC_PLAY__</button>
  </div>
  <div class="klines" id="k-lines"></div>
</div>

<nav id="bottomnav">
  <button class="bn" data-v="home" onclick="go('home')">__IC_HOME__<span>Главная</span></button>
  <button class="bn" data-v="search" onclick="go('search')">__IC_SEARCH__<span>Поиск</span></button>
  <button class="bn" data-v="library" onclick="go('library')">__IC_LIB__<span>Медиатека</span></button>
  <button class="bn" data-v="profile" onclick="go('profile')">__IC_USER__<span>Профиль</span></button>
  <button class="bn" id="bn-admin" data-v="admin" onclick="go('admin')" style="display:none">__IC_SHIELD__<span>Админ</span></button>
</nav>

<div class="overlay" id="ov"><div class="modal" id="ov-modal"></div></div>
<div class="toast" id="toast"></div>

<audio id="audio" crossorigin="anonymous"></audio>

<script>
__APP_JS__
</script>
</body>
</html>`;

// ===================================================================
//  КЛИЕНТСКИЙ JS MINI-APP (без \\, бэктиков и ${} — сохраняется в шаблоне)
// ===================================================================
const APP_JS = `
var tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor && tg.setHeaderColor('#0a0a0a'); } catch(e){} }
var INIT = (tg && tg.initData) ? tg.initData : '';
var ME = null;
var STATE = { view:'home', haptic:true, queue:[], qi:-1, curTrack:null, lyrics:[], lyIdx:-1, likedTracks:{}, lists:{}, libTab:'playlists' };
var audio = document.getElementById('audio');

var SVG_VERIFY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.3 1.7 2.9-.2 1 2.7 2.5 1.5-.9 2.8.9 2.8-2.5 1.5-1 2.7-2.9-.2L12 22l-2.3-1.7-2.9.2-1-2.7L3.3 16l.9-2.8L3.3 8.4l2.5-1.5 1-2.7 2.9.2z"/><path d="M10.4 14.4l-1.9-1.9 1-1 .9.9 2.9-2.9 1 1z" fill="#0a0a0a"/></svg>';
var SVG_NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V6l9-2v12"/><circle cx="6" cy="18" r="2.4" fill="currentColor"/><circle cx="15" cy="16" r="2.4" fill="currentColor"/></svg>';
var SVG_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var SVG_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

function byId(i){ return document.getElementById(i); }
function esc(s){ s=(s==null?'':String(s)); return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;'); }
function fmt(t){ t=Math.floor(t||0); if(isNaN(t)||t<0)t=0; var m=Math.floor(t/60), s=t%60; return m+':'+(s<10?'0':'')+s; }
function toast(msg){ var e=byId('toast'); e.textContent=msg; e.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(function(){ e.classList.remove('show'); },2200); }
function haptic(type){ if(!STATE.haptic||!tg||!tg.HapticFeedback) return; try{ tg.HapticFeedback.impactOccurred(type||'light'); }catch(e){} }
function setScroll(html){ byId('scroll').innerHTML = html; byId('scroll').scrollTop = 0; }
function api(p, opts){ opts=opts||{}; opts.headers=opts.headers||{}; opts.headers['X-Init-Data']=INIT; if(opts.body && typeof opts.body!=='string'){ opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(opts.body); } return fetch(p,opts).then(function(r){ return r.json(); }).catch(function(){ return { error:'network' }; }); }

function artistLine(t){ var a=esc(t.artist||''); if(t.feats && t.feats.length){ a += ' <span class="feat">feat. '+t.feats.map(esc).join(', ')+'</span>'; } return a; }

function go(view){ STATE.view=view; haptic('light'); var bs=document.querySelectorAll('[data-v]'); for(var i=0;i<bs.length;i++){ bs[i].classList.toggle('active', bs[i].getAttribute('data-v')===view); } render(); }
function render(){
  if(STATE.view==='home') return renderHome();
  if(STATE.view==='search') return renderSearch();
  if(STATE.view==='library') return renderLibrary();
  if(STATE.view==='profile') return renderProfile(ME?ME.id:null);
  if(STATE.view==='settings') return renderSettings();
  if(STATE.view==='admin') return renderAdmin();
}

function topbar(title){ return '<div class="topbar"><h1>'+esc(title)+'</h1><button class="avatarbtn" onclick="go(\\'profile\\')"><img src="'+esc(ME&&ME.avatar?ME.avatar:'')+'" onerror="this.style.opacity=0"></button></div>'; }

// ── КАРТОЧКИ И СПИСКИ ──
function cardHtml(listKey, t, i, isAlbum){
  var sub = isAlbum ? esc(t.artist||'Альбом') : esc(t.artist||'');
  var click = isAlbum ? ('openAlbum(\\''+t.albumId+'\\')') : ('playFrom(\\''+listKey+'\\','+i+')');
  return '<div class="card" onclick="'+click+'">'+
    '<img class="cover" src="'+esc(t.cover||'')+'" onerror="this.style.opacity=.3">'+
    '<div class="ctitle">'+esc(t.title)+'</div><div class="csub">'+sub+'</div>'+
    '<button class="cplay" onclick="event.stopPropagation();'+click+'">'+SVG_PLAY+'</button></div>';
}
function grid(listKey, items, isAlbum){ var h='<div class="grid">'; for(var i=0;i<items.length;i++){ h+=cardHtml(listKey,items[i],i,isAlbum); } return h+'</div>'; }

function trackRow(listKey, t, i){
  var playing = (STATE.curTrack && STATE.curTrack.ytId===t.ytId) ? ' playing':'';
  return '<div class="trow'+playing+'" onclick="playFrom(\\''+listKey+'\\','+i+')">'+
    '<div class="tn">'+(i+1)+'</div>'+
    '<img class="tcover" src="'+esc(t.cover||'')+'" onerror="this.style.opacity=.3">'+
    '<div class="tmeta"><div class="tt">'+esc(t.title)+'</div><div class="ta">'+artistLine(t)+'</div></div>'+
    '<div class="tdur">'+fmt(t.duration)+'</div></div>';
}
function trackList(listKey, items){ STATE.lists[listKey]=items; if(!items||!items.length) return '<div class="empty">Ничего не найдено</div>'; var h='<div class="tracklist">'; for(var i=0;i<items.length;i++){ h+=trackRow(listKey,items[i],i); } return h+'</div>'; }

// ── ГЛАВНАЯ ──
function renderHome(){
  setScroll(topbar('Главная')+'<div class="empty">Загрузка…</div>');
  api('/api/home').then(function(d){
    if(d.error){ setScroll(topbar('Главная')+'<div class="empty">Ошибка загрузки</div>'); return; }
    var h = topbar('Главная');
    var ed = d.editorial||{};
    STATE.lists['ed']=ed.items||[];
    if(ed.enabled && ed.items && ed.items.length){
      var p = ed.items[0];
      h += '<div class="promo">'+
        '<div class="promo-cover" style="background-image:url('+JSON.stringify(p.cover||'')+')"></div>'+
        '<div class="promo-grad"></div>'+
        '<div class="promo-in"><span class="badge">✨ Выбрано редакцией</span>'+
        '<h2>'+esc(p.title)+'</h2><p>'+esc(p.artist||'')+'</p>'+
        '<button class="playbig" onclick="playFrom(\\'ed\\',0)">'+SVG_PLAY+' Слушать</button></div></div>';
      if(ed.items.length>1){ h += '<div class="section-title">Выбрано редакцией</div>'+grid('ed',ed.items,false); }
    }
    h += '<div class="section-title">Сейчас популярно</div>'+trackList('home', d.list||[]);
    setScroll(h);
  });
}

// ── ПОИСК ──
function renderSearch(){
  var h = '<div class="topbar"><div class="searchbox"><input id="q" placeholder="Что послушаем?" autocomplete="off"></div></div><div id="sres"><div class="empty">Начните вводить название трека или исполнителя</div></div>';
  setScroll(h);
  var inp = byId('q'); inp.focus();
  inp.addEventListener('input', function(){ clearTimeout(renderSearch._t); var v=inp.value.trim(); if(!v){ byId('sres').innerHTML='<div class="empty">Начните вводить…</div>'; return; } renderSearch._t=setTimeout(function(){ doSearch(v); },380); });
}
function doSearch(q){
  byId('sres').innerHTML='<div class="empty">Поиск…</div>';
  api('/api/search?q='+encodeURIComponent(q)).then(function(d){
    if(d.error||(!d.songs&&!d.albums)){ byId('sres').innerHTML='<div class="empty">Ничего не найдено</div>'; return; }
    var h='';
    if(d.songs&&d.songs.length){ h+='<div class="section-title">Треки</div>'+trackList('search',d.songs); }
    if(d.albums&&d.albums.length){ h+='<div class="section-title">Альбомы</div>'+grid('searchAlb',d.albums,true); }
    byId('sres').innerHTML = h||'<div class="empty">Ничего не найдено</div>';
  });
}

// ── АЛЬБОМ ──
function openAlbum(albumId){
  haptic('light'); setScroll('<div class="empty">Загрузка альбома…</div>');
  api('/api/album/'+encodeURIComponent(albumId)).then(function(d){
    if(d.error||!d.album){ setScroll('<div class="empty">Не удалось загрузить альбом</div>'); return; }
    var a=d.album;
    var h='<div class="profhead"><img class="pa" style="border-radius:12px" src="'+esc(a.cover||'')+'"><div><div class="pn">'+esc(a.title)+'</div><div class="pb">'+esc(a.artist||'')+(a.year?' · '+esc(a.year):'')+'</div>'+
      '<button class="btn green" style="margin-top:12px" onclick="playFrom(\\'album\\',0)">'+SVG_PLAY+' Слушать</button>'+
      ' <button class="btn" style="margin-top:12px" onclick="toggleLikeAlbum('+JSON.stringify(JSON.stringify(a))+')">♥ В любимое</button></div></div>';
    h += trackList('album', d.tracks||[]);
    setScroll(h);
  });
}

// ── МЕДИАТЕКА ──
function renderLibrary(){
  var h=topbar('Медиатека');
  h+='<div><span class="chip'+(STATE.libTab==='playlists'?' active':'')+'" onclick="STATE.libTab=\\'playlists\\';renderLibrary()">Плейлисты</span>'+
     '<span class="chip'+(STATE.libTab==='liked'?' active':'')+'" onclick="STATE.libTab=\\'liked\\';renderLibrary()">Любимое</span></div>';
  h+='<div id="libc"><div class="empty">Загрузка…</div></div>';
  setScroll(h);
  if(STATE.libTab==='playlists'){
    api('/api/playlists').then(function(d){
      var c='<button class="btn green" style="margin:6px 0 18px" onclick="openCreatePlaylist()">+ Создать плейлист</button>';
      var pls=d.playlists||[];
      if(!pls.length){ c+='<div class="empty">У вас пока нет плейлистов</div>'; }
      else { c+='<div class="grid">'; for(var i=0;i<pls.length;i++){ var p=pls[i]; c+='<div class="card" onclick="openPlaylist('+p.id+')"><img class="cover" src="'+esc(p.cover||'')+'" onerror="this.style.opacity=.2"><div class="ctitle">'+esc(p.name)+'</div><div class="csub">'+(p.count||0)+' тр.</div></div>'; } c+='</div>'; }
      byId('libc').innerHTML=c;
    });
  } else {
    api('/api/likes').then(function(d){
      var c=''; var tr=d.tracks||[]; var al=d.albums||[];
      if(tr.length){ c+='<div class="section-title">Любимые треки</div>'+trackList('liked',tr); }
      if(al.length){ c+='<div class="section-title">Любимые альбомы</div>'+grid('likedAlb',al,true); }
      byId('libc').innerHTML = c||'<div class="empty">Пока пусто — лайкайте треки и альбомы</div>';
    });
  }
}
function openPlaylist(id){
  haptic('light'); setScroll('<div class="empty">Загрузка…</div>');
  api('/api/playlist/'+id).then(function(d){
    if(d.error||!d.playlist){ setScroll('<div class="empty">Плейлист не найден</div>'); return; }
    var p=d.playlist; var tr=d.tracks||[];
    var h='<div class="profhead"><div style="width:120px;height:120px;border-radius:12px;background:linear-gradient(135deg,#5b2a86,#1db954);display:flex;align-items:center;justify-content:center;font-size:48px">🎵</div>'+
      '<div><div class="pn">'+esc(p.name)+'</div><div class="pb">'+tr.length+' треков</div>'+
      (tr.length?'<button class="btn green" style="margin-top:12px" onclick="playFrom(\\'pl\\',0)">'+SVG_PLAY+' Слушать</button> ':'')+
      '<button class="btn" style="margin-top:12px" onclick="deletePlaylist('+p.id+')">🗑 Удалить</button></div></div>';
    STATE.lists['pl']=tr;
    if(!tr.length){ h+='<div class="empty">Плейлист пуст. Добавляйте треки через кнопку + в плеере</div>'; }
    else { h+='<div class="tracklist">'; for(var i=0;i<tr.length;i++){ h+='<div class="trow" onclick="playFrom(\\'pl\\','+i+')"><div class="tn">'+(i+1)+'</div><img class="tcover" src="'+esc(tr[i].cover||'')+'"><div class="tmeta"><div class="tt">'+esc(tr[i].title)+'</div><div class="ta">'+artistLine(tr[i])+'</div></div><button class="iconbtn" onclick="event.stopPropagation();removeFromPlaylist('+p.id+',\\''+tr[i].ytId+'\\')">✕</button></div>'; } h+='</div>'; }
    setScroll(h);
  });
}
function deletePlaylist(id){ api('/api/playlist/'+id,{method:'DELETE'}).then(function(){ toast('Плейлист удалён'); go('library'); }); }
function removeFromPlaylist(id,ytId){ api('/api/playlist/'+id+'/tracks/'+encodeURIComponent(ytId),{method:'DELETE'}).then(function(){ haptic('light'); openPlaylist(id); }); }

// ── ПРОФИЛЬ ──
function badges(u){ var s=''; if(u.is_verified) s+='<span class="badge-v" title="Верифицирован">'+SVG_VERIFY+'</span>'; if(u.is_author) s+='<span class="badge-a" title="Автор">'+SVG_NOTE+'</span>'; return s; }
function renderProfile(userId){
  setScroll('<div class="empty">Загрузка…</div>');
  api('/api/profile/'+(userId||'')).then(function(d){
    if(d.error||!d.user){ setScroll('<div class="empty">Профиль недоступен</div>'); return; }
    var u=d.user; var own = ME && u.id===ME.id;
    var h='<div class="profhead"><img class="pa" src="'+esc(u.avatar||'')+'" onerror="this.style.opacity=.3"><div>'+
      '<div class="pn">'+esc(u.name||'Пользователь')+badges(u)+'</div>'+
      (u.bio?'<div class="pb">'+esc(u.bio)+'</div>':'')+
      '<div class="statline">♥ '+(d.likedCount||0)+' лайков · 🎵 '+(d.playlistCount||0)+' плейлистов · ✍ '+(d.reviewCount||0)+' рецензий</div>'+
      (own?'<button class="btn" style="margin-top:12px" onclick="openEditProfile()">⚙ Редактировать</button>':'')+
      '</div></div>';
    if(d.tracks&&d.tracks.length){ h+='<div class="section-title">Любимые треки</div>'+trackList('proftracks',d.tracks); }
    if(d.reviews&&d.reviews.length){ h+='<div class="section-title">Рецензии</div>'; for(var i=0;i<d.reviews.length;i++){ h+=reviewHtml(d.reviews[i]); } }
    setScroll(h);
  });
}
function reviewHtml(r){
  return '<div class="review"><div class="rh"><div style="font-weight:700">'+esc(r.trackTitle||r.author||'')+'</div><div class="rscore">'+r.total+' / 90</div></div>'+
    (r.text?'<div class="rtext">'+esc(r.text)+'</div>':'')+
    '<div class="rcrit">Редкость '+r.rarity+' · Целостность '+r.integrity+' · Глубина '+r.depth+' · Реализация '+r.realization+' · Харизма '+r.charisma+' · Актуальность '+r.relevance+'</div></div>';
}

// ── НАСТРОЙКИ ──
function renderSettings(){
  var h=topbar('Настройки');
  h+='<div class="trow" style="cursor:default"><div class="tmeta"><div class="tt">Вибрация (haptic feedback)</div><div class="ta">Лёгкая отдача при нажатиях на телефоне</div></div>'+
    '<label style="position:relative;display:inline-block;width:52px;height:30px"><input type="checkbox" id="hap" '+(STATE.haptic?'checked':'')+' onchange="toggleHaptic(this.checked)" style="opacity:0;width:0;height:0"><span id="hapk" style="position:absolute;inset:0;background:'+(STATE.haptic?'var(--accent)':'#555')+';border-radius:30px;transition:.2s"></span><span style="position:absolute;top:3px;left:'+(STATE.haptic?'25px':'3px')+';width:24px;height:24px;background:#fff;border-radius:50%;transition:.2s" id="hapd"></span></label></div>';
  h+='<div class="trow" onclick="openEditProfile()"><div class="tmeta"><div class="tt">Редактировать профиль</div><div class="ta">Имя, описание, аватар</div></div><div class="tdur">›</div></div>';
  h+='<div class="empty" style="padding:30px 0;text-align:left">Dreinnify · музыкальный плеер</div>';
  setScroll(h);
}
function toggleHaptic(v){ STATE.haptic=v; byId('hapk').style.background=v?'var(--accent)':'#555'; byId('hapd').style.left=v?'25px':'3px'; haptic('light'); api('/api/me',{method:'POST',body:{haptic_enabled:v?1:0}}); }

// ── ПЛЕЕР ──
function playFrom(listKey,i){ var list=STATE.lists[listKey]; if(!list||!list[i]) return; STATE.queue=list.slice(); STATE.qi=i; loadCurrent(true); }
function loadCurrent(autoplay){
  var t=STATE.queue[STATE.qi]; if(!t) return; STATE.curTrack=t; STATE.lyrics=[]; STATE.lyIdx=-1;
  audio.src='/api/stream/'+encodeURIComponent(t.ytId)+'?initData='+encodeURIComponent(INIT);
  api('/api/play',{method:'POST',body:{track:t}});
  if(autoplay!==false){ audio.play().catch(function(){}); }
  updatePlayerUI(); byId('miniplayer').classList.add('show');
  if(STATE.view==='home'||STATE.view==='search'||STATE.view==='library') render();
  haptic('medium');
}
function updatePlayerUI(){
  var t=STATE.curTrack; if(!t) return;
  byId('mp-cover').src=t.cover||''; byId('mp-t').textContent=t.title||''; byId('mp-a').innerHTML=artistLine(t);
  byId('pl-cover').src=t.cover||''; byId('pl-title').textContent=t.title||''; byId('pl-artist').innerHTML=artistLine(t);
  byId('k-title').textContent=t.title||'';
  var liked = !!STATE.likedTracks[t.ytId];
  byId('mp-like').classList.toggle('liked',liked); byId('pl-like').classList.toggle('liked',liked);
  setPP();
}
function setPP(){ var ic=audio.paused?SVG_PLAY:SVG_PAUSE; byId('mp-pp').innerHTML=ic; byId('pl-pp').innerHTML=ic; byId('k-pp').innerHTML=ic; }
function togglePlay(){ if(audio.paused) audio.play().catch(function(){}); else audio.pause(); haptic('light'); }
function nextTrack(){ if(STATE.qi<STATE.queue.length-1){ STATE.qi++; loadCurrent(true); } }
function prevTrack(){ if(audio.currentTime>3){ audio.currentTime=0; return; } if(STATE.qi>0){ STATE.qi--; loadCurrent(true); } }
function openPlayer(){ if(!STATE.curTrack) return; byId('player').classList.add('show'); haptic('light'); }
function closePlayer(){ byId('player').classList.remove('show'); }

audio.addEventListener('play',setPP); audio.addEventListener('pause',setPP);
audio.addEventListener('ended',nextTrack);
audio.addEventListener('timeupdate',function(){
  var d=audio.duration||0, c=audio.currentTime||0; var pct=d?(c/d*100):0;
  byId('mp-fill').style.width=pct+'%'; byId('pl-seekfill').style.width=pct+'%';
  byId('pl-cur').textContent=fmt(c); byId('pl-dur').textContent=fmt(d);
  syncKaraoke(c);
});
byId('pl-seek').addEventListener('click',function(e){ var r=this.getBoundingClientRect(); var ratio=(e.clientX-r.left)/r.width; if(audio.duration) audio.currentTime=ratio*audio.duration; });

// ── ЛАЙКИ ──
function toggleLikeCurrent(e){ if(e) e.stopPropagation(); var t=STATE.curTrack; if(!t) return; var nowLiked=!STATE.likedTracks[t.ytId]; STATE.likedTracks[t.ytId]=nowLiked; updatePlayerUI(); haptic('light');
  api('/api/like',{method:'POST',body:{type:'track',track:t}}).then(function(d){ if(d&&typeof d.liked==='boolean'){ STATE.likedTracks[t.ytId]=d.liked; updatePlayerUI(); } toast(nowLiked?'Добавлено в любимое':'Убрано из любимого'); }); }
function toggleLikeAlbum(json){ var a=JSON.parse(json); api('/api/like',{method:'POST',body:{type:'album',album:a}}).then(function(d){ haptic('light'); toast(d&&d.liked?'Альбом в любимом':'Убрано из любимого'); }); }
function loadLikes(){ api('/api/likes').then(function(d){ STATE.likedTracks={}; (d.tracks||[]).forEach(function(t){ STATE.likedTracks[t.ytId]=true; }); if(STATE.curTrack) updatePlayerUI(); }); }

// ── КАРАОКЕ ──
function openKaraoke(){ var t=STATE.curTrack; if(!t) return; byId('karaoke').classList.add('show'); haptic('light');
  if(STATE.lyrics.length){ renderLyrics(); return; }
  byId('k-lines').innerHTML='<div class="kline active">Загрузка текста…</div>';
  api('/api/lyrics/'+encodeURIComponent(t.ytId)+'?artist='+encodeURIComponent(t.artist||'')+'&title='+encodeURIComponent(t.title||'')).then(function(d){
    STATE.lyrics=(d&&d.lines)?d.lines:[]; if(!STATE.lyrics.length){ byId('k-lines').innerHTML='<div class="kline active">Синхронизированный текст не найден</div>'; return; } renderLyrics(); });
}
function closeKaraoke(){ byId('karaoke').classList.remove('show'); }
function renderLyrics(){ var h=''; for(var i=0;i<STATE.lyrics.length;i++){ h+='<div class="kline" id="ly'+i+'">'+esc(STATE.lyrics[i].line||'…')+'</div>'; } byId('k-lines').innerHTML=h; STATE.lyIdx=-1; }
function syncKaraoke(c){ if(!STATE.lyrics.length||!byId('karaoke').classList.contains('show')) return; var idx=-1; for(var i=0;i<STATE.lyrics.length;i++){ if(STATE.lyrics[i].time<=c) idx=i; else break; } if(idx===STATE.lyIdx) return; STATE.lyIdx=idx;
  for(var j=0;j<STATE.lyrics.length;j++){ var el=byId('ly'+j); if(!el) continue; el.className='kline'+(j===idx?' active':(j<idx?' passed':'')); }
  var act=byId('ly'+idx); if(act){ act.scrollIntoView({block:'center',behavior:'smooth'}); }
}

// ── МОДАЛЬНЫЕ ОКНА ──
function showModal(html){ byId('ov-modal').innerHTML=html; byId('ov').classList.add('show'); }
function closeModal(){ byId('ov').classList.remove('show'); }
byId('ov').addEventListener('click',function(e){ if(e.target===this) closeModal(); });

function openCreatePlaylist(){ showModal('<h3>Новый плейлист</h3><label>Название</label><input type="text" id="plname" placeholder="Мой плейлист"><div class="row"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn green" onclick="createPlaylist()">Создать</button></div>'); byId('plname').focus(); }
function createPlaylist(){ var n=byId('plname').value.trim(); if(!n) return; api('/api/playlists',{method:'POST',body:{name:n}}).then(function(){ closeModal(); haptic('light'); STATE.libTab='playlists'; go('library'); }); }
function openAddPlaylist(){ var t=STATE.curTrack; if(!t) return; api('/api/playlists').then(function(d){ var pls=d.playlists||[]; var h='<h3>Добавить в плейлист</h3>'; if(!pls.length){ h+='<div class="empty">Нет плейлистов</div>'; } else { h+='<div class="tracklist">'; for(var i=0;i<pls.length;i++){ h+='<div class="trow" onclick="addToPlaylist('+pls[i].id+')"><div class="tmeta"><div class="tt">'+esc(pls[i].name)+'</div><div class="ta">'+(pls[i].count||0)+' тр.</div></div><div class="tdur">+</div></div>'; } h+='</div>'; } h+='<div class="row"><button class="btn" onclick="closeModal()">Закрыть</button><button class="btn green" onclick="openCreatePlaylist()">+ Новый</button></div>'; showModal(h); }); }
function addToPlaylist(id){ var t=STATE.curTrack; if(!t) return; api('/api/playlist/'+id+'/tracks',{method:'POST',body:{track:t}}).then(function(d){ closeModal(); haptic('light'); toast(d&&d.status==='duplicate'?'Уже в плейлисте':'Добавлено'); }); }

function openEditProfile(){ var u=ME||{}; showModal('<h3>Редактирование профиля</h3><label>Имя</label><input type="text" id="ename" value="'+esc(u.name||'')+'"><label>О себе</label><textarea id="ebio">'+esc(u.bio||'')+'</textarea><label>Ссылка на аватар</label><input type="text" id="eav" value="'+esc(u.avatar||'')+'" placeholder="https://"><div class="row"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn green" onclick="saveProfile()">Сохранить</button></div>'); }
function saveProfile(){ var body={ name:byId('ename').value.trim(), bio:byId('ebio').value.trim(), avatar:byId('eav').value.trim() }; api('/api/me',{method:'POST',body:body}).then(function(d){ if(d&&d.user) ME=d.user; closeModal(); haptic('light'); toast('Сохранено'); render(); }); }

// ── РЕЦЕНЗИИ ──
var CRITS=[['rarity','Редкость','Уникальность и распространённость жанра в русскоязычной индустрии'],['integrity','Целостность','Насколько хорошо соблюдена жанровая и смысловая концепция'],['depth','Глубина','Смысловая нагрузка, наличие интересных тем и образов'],['realization','Реализация','Качество технической части: ритмика, сведение, владение голосом'],['charisma','Харизма / Атмосфера','Убедительность исполнителя и передача эмоций'],['relevance','Актуальность','Соответствие релиза современным тенденциям']];
function openReview(){ var t=STATE.curTrack; if(!t) return; var h='<h3>Оценить: '+esc(t.title)+'</h3><div class="scorebig" id="rvscore">18 / 90</div>'; for(var i=0;i<CRITS.length;i++){ var c=CRITS[i]; h+='<div class="crit"><div class="clab"><span>'+c[1]+'</span><span class="cval" id="v_'+c[0]+'">1</span></div><input type="range" min="1" max="5" value="1" id="r_'+c[0]+'" oninput="recalcReview()"><div class="cdesc">'+c[2]+'</div></div>'; } h+='<label>Отзыв (необязательно)</label><textarea id="rvtext" placeholder="Ваше мнение…"></textarea><div class="row"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn green" onclick="submitReview()">Отправить</button></div><div id="rvlist"></div>'; showModal(h); recalcReview();
  api('/api/track/'+encodeURIComponent(t.ytId)+'/reviews').then(function(d){ if(d&&d.reviews&&d.reviews.length){ var rh='<div class="section-title">Другие рецензии (ср. '+d.average+'/90)</div>'; for(var i=0;i<d.reviews.length;i++){ rh+=reviewHtml(d.reviews[i]); } byId('rvlist').innerHTML=rh; } }); }
function recalcReview(){ var sum=0; for(var i=0;i<CRITS.length;i++){ var v=parseInt(byId('r_'+CRITS[i][0]).value,10)||1; byId('v_'+CRITS[i][0]).textContent=v; sum+=v; } byId('rvscore').textContent=(sum*3)+' / 90'; }
function submitReview(){ var t=STATE.curTrack; var body={ track:t, text:byId('rvtext').value.trim() }; for(var i=0;i<CRITS.length;i++){ body[CRITS[i][0]]=parseInt(byId('r_'+CRITS[i][0]).value,10)||1; } api('/api/review',{method:'POST',body:body}).then(function(d){ closeModal(); haptic('medium'); toast(d&&d.total?('Оценка '+d.total+'/90 сохранена'):'Рецензия сохранена'); }); }

// ── АДМИН-ПАНЕЛЬ ──
function renderAdmin(){
  if(!ME||!ME.isAdmin){ setScroll('<div class="empty">Доступ запрещён</div>'); return; }
  setScroll(topbar('Админ')+'<div class="empty">Загрузка…</div>');
  api('/api/admin/stats').then(function(d){
    if(d.error){ setScroll(topbar('Админ')+'<div class="empty">Доступ запрещён</div>'); return; }
    var h=topbar('Админ');
    h+='<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">'+
      adminStat('👥 Пользователи',d.users)+adminStat('🎵 Треки',d.tracks)+adminStat('▶ Прослушивания',d.plays)+adminStat('♥ Лайки',d.likes)+adminStat('✍ Рецензии',d.reviews)+adminStat('⛔ Баны',d.banned)+'</div>';
    h+='<div class="section-title">«Выбрано редакцией»</div>';
    h+='<div class="trow" style="cursor:default"><div class="tmeta"><div class="tt">Показывать блок на главной</div></div><button class="btn '+(d.editorialEnabled?'green':'')+'" onclick="toggleEditorial('+(d.editorialEnabled?0:1)+')">'+(d.editorialEnabled?'Включено':'Выключено')+'</button></div>';
    h+='<div id="edlist"></div>';
    h+='<button class="btn" style="margin:8px 0" onclick="openAdminPick()">+ Добавить трек в блок</button>';
    h+='<div class="section-title">Пользователи</div><div class="searchbox" style="max-width:none"><input id="uq" placeholder="Поиск по имени / ID" oninput="adminSearchUsers()"></div><div id="ulist"></div>';
    setScroll(h);
    renderEditorialAdmin(d.editorial||[]);
    adminSearchUsers();
  });
}
function adminStat(label,val){ return '<div class="card" style="cursor:default"><div class="csub">'+label+'</div><div style="font-size:26px;font-weight:800;margin-top:6px">'+(val||0)+'</div></div>'; }
function renderEditorialAdmin(items){ var h=''; if(!items.length){ h='<div class="empty" style="text-align:left;padding:12px 0">Блок пуст</div>'; } else { h='<div class="tracklist">'; for(var i=0;i<items.length;i++){ var t=items[i]; h+='<div class="trow"><div class="tn">'+(i+1)+'</div><img class="tcover" src="'+esc(t.cover||'')+'"><div class="tmeta"><div class="tt">'+esc(t.title)+'</div><div class="ta">'+esc(t.artist||'')+'</div></div><button class="iconbtn" onclick="removeEditorial(\\''+t.ytId+'\\')">✕</button></div>'; } h+='</div>'; } byId('edlist').innerHTML=h; }
function toggleEditorial(v){ api('/api/admin/editorial/toggle',{method:'POST',body:{enabled:v}}).then(function(){ haptic('light'); renderAdmin(); }); }
function removeEditorial(ytId){ api('/api/admin/editorial/remove',{method:'POST',body:{ytId:ytId}}).then(function(){ haptic('light'); renderAdmin(); }); }
function openAdminPick(){ showModal('<h3>Добавить в «Выбрано редакцией»</h3><input type="text" id="apq" placeholder="Поиск трека" oninput="adminPickSearch()"><div id="apres" style="margin-top:12px"></div><div class="row"><button class="btn" onclick="closeModal()">Закрыть</button></div>'); byId('apq').focus(); }
function adminPickSearch(){ clearTimeout(adminPickSearch._t); var v=byId('apq').value.trim(); if(!v) return; adminPickSearch._t=setTimeout(function(){ api('/api/search?q='+encodeURIComponent(v)).then(function(d){ var songs=d.songs||[]; var h='<div class="tracklist">'; for(var i=0;i<songs.length;i++){ h+='<div class="trow" onclick="addEditorial('+JSON.stringify(JSON.stringify(songs[i]))+')"><img class="tcover" src="'+esc(songs[i].cover||'')+'"><div class="tmeta"><div class="tt">'+esc(songs[i].title)+'</div><div class="ta">'+esc(songs[i].artist||'')+'</div></div><div class="tdur">+</div></div>'; } byId('apres').innerHTML=h+'</div>'; }); },380); }
function addEditorial(json){ var t=JSON.parse(json); api('/api/admin/editorial/add',{method:'POST',body:{track:t}}).then(function(){ closeModal(); haptic('light'); toast('Добавлено в блок'); renderAdmin(); }); }
function adminSearchUsers(){ clearTimeout(adminSearchUsers._t); adminSearchUsers._t=setTimeout(function(){ var q=byId('uq')?byId('uq').value.trim():''; api('/api/admin/users?q='+encodeURIComponent(q)).then(function(d){ var us=d.users||[]; var h='<div class="tracklist">'; for(var i=0;i<us.length;i++){ var u=us[i]; h+='<div class="trow" style="cursor:default"><img class="tcover" src="'+esc(u.avatar||'')+'"><div class="tmeta"><div class="tt">'+esc(u.name||'?')+badges(u)+(u.is_banned?' <span style="color:var(--danger)">бан</span>':'')+'</div><div class="ta">ID '+u.tg_id+'</div></div></div>'+
  '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px 60px">'+
  adminBtn(u.is_banned?'✓ Разбан':'⛔ Бан','adminUser(\\''+(u.is_banned?'unban':'ban')+'\\','+u.id+')')+
  adminBtn(u.is_verified?'✓ Снять вериф.':'🔵 Верификация','adminUser(\\'verify\\','+u.id+','+(u.is_verified?0:1)+')')+
  adminBtn(u.is_author?'✓ Снять автора':'🎵 Автор','adminUser(\\'author\\','+u.id+','+(u.is_author?0:1)+')')+'</div>'; } byId('ulist').innerHTML=(us.length?h+'</div>':'<div class="empty" style="text-align:left">Нет пользователей</div>'); }); },380); }
function adminBtn(label,call){ return '<button class="btn" style="padding:7px 12px;font-size:13px" onclick="'+call+'">'+label+'</button>'; }
function adminUser(action,id,value){ api('/api/admin/user',{method:'POST',body:{action:action,userId:id,value:value}}).then(function(){ haptic('light'); adminSearchUsers(); }); }

// ── СТАРТ ──
function boot(){ api('/api/me').then(function(d){ if(d&&d.user){ ME=d.user; STATE.haptic = ME.haptic_enabled!==0; if(ME.isAdmin){ byId('nav-admin').style.display=''; byId('bn-admin').style.display=''; } if(ME.banned){ setScroll('<div class="empty">Ваш доступ ограничен администратором</div>'); return; } } loadLikes(); go('home'); }); }
boot();
`;

// ===================================================================
//  SVG-ИКОНКИ (подставляются в шаблон)
// ===================================================================
const ICONS = {
  "__IC_HOME__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>',
  "__IC_SEARCH__": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
  "__IC_LIB__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h2v14H4zM8 5h2v14H8zM13 4.5l5 1.2v13l-5-1.2z"/></svg>',
  "__IC_USER__": '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6z"/></svg>',
  "__IC_GEAR__": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  "__IC_SHIELD__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/></svg>',
  "__IC_HEART__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>',
  "__IC_PREV__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>',
  "__IC_PLAY__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  "__IC_NEXT__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z"/></svg>',
  "__IC_DOWN__": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>',
  "__IC_STAR__": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 17.8 6.1 21.3l1.7-6.6L2.6 9.8l6.8-.5z"/></svg>',
  "__IC_PLUS__": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  "__IC_MIC__": '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
};
function renderPage(){
  let html = FRONTEND_HTML;
  for (const k in ICONS) { html = html.split(k).join(ICONS[k]); }
  html = html.split("__APP_JS__").join(APP_JS);
  return html;
}

// ===================================================================
//  КОНФИГУРАЦИЯ (.env)
// ===================================================================
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const MINIAPP_DOMAIN = process.env.MINIAPP_DOMAIN || "";
const PORT = parseInt(process.env.PORT || "3000", 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "music.db");
const DEV_MODE = process.env.DEV_MODE === "1";

if (!BOT_TOKEN) console.warn("[ warn ] BOT_TOKEN не задан — бот не запустится (можно тестить Mini-App с DEV_MODE=1).");
if (!MINIAPP_DOMAIN) console.warn("[ warn ] MINIAPP_DOMAIN не задан — кнопка Mini-App в боте не появится.");

// ===================================================================
//  БАЗА ДАННЫХ (SQLite)
// ===================================================================
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id TEXT UNIQUE, name TEXT, username TEXT, avatar TEXT, bio TEXT,
  is_banned INTEGER DEFAULT 0, is_verified INTEGER DEFAULT 0, is_author INTEGER DEFAULT 0,
  haptic_enabled INTEGER DEFAULT 1, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  yt_id TEXT UNIQUE, title TEXT, artist TEXT, feats TEXT, album_id TEXT,
  cover TEXT, duration INTEGER DEFAULT 0, plays INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  yt_id TEXT UNIQUE, title TEXT, artist TEXT, cover TEXT, year TEXT
);
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER, name TEXT, cover TEXT, is_public INTEGER DEFAULT 1, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER, track_id INTEGER, position INTEGER
);
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, target_type TEXT, target_id TEXT, created_at INTEGER,
  UNIQUE(user_id, target_type, target_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, track_id INTEGER,
  rarity INTEGER, integrity INTEGER, depth INTEGER, realization INTEGER, charisma INTEGER, relevance INTEGER,
  total INTEGER, text TEXT, created_at INTEGER,
  UNIQUE(user_id, track_id)
);
CREATE TABLE IF NOT EXISTS editorial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER UNIQUE, position INTEGER
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
`);

function getSetting(k, def) { const r = db.prepare("SELECT value FROM settings WHERE key=?").get(k); return r ? r.value : def; }
function setSetting(k, v) { db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, String(v)); }
if (getSetting("editorial_enabled", null) === null) setSetting("editorial_enabled", "1");

// ===================================================================
//  АУТЕНТИФИКАЦИЯ TELEGRAM WEBAPP
// ===================================================================
function validateInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const pairs = [];
    for (const [k, v] of params) pairs.push(k + "=" + v);
    pairs.sort();
    const dcs = pairs.join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const check = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
    if (check !== hash) return null;
    const u = params.get("user");
    return u ? JSON.parse(u) : null;
  } catch (e) { return null; }
}
function getOrCreateUser(tgUser) {
  const tgId = String(tgUser.id);
  let row = db.prepare("SELECT * FROM users WHERE tg_id=?").get(tgId);
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Пользователь";
  const avatar = tgUser.photo_url || "";
  if (!row) {
    db.prepare("INSERT INTO users (tg_id,name,username,avatar,haptic_enabled,created_at) VALUES (?,?,?,?,1,?)")
      .run(tgId, name, tgUser.username || "", avatar, Date.now());
    row = db.prepare("SELECT * FROM users WHERE tg_id=?").get(tgId);
  } else if (avatar && !row.avatar) {
    db.prepare("UPDATE users SET avatar=? WHERE id=?").run(avatar, row.id);
    row.avatar = avatar;
  }
  return row;
}
function publicUser(u) {
  return { id: u.id, tg_id: u.tg_id, name: u.name, username: u.username, avatar: u.avatar, bio: u.bio,
    is_verified: u.is_verified, is_author: u.is_author, is_banned: u.is_banned, haptic_enabled: u.haptic_enabled };
}
function auth(req, res, next) {
  const initData = req.get("X-Init-Data") || req.query.initData || "";
  let tgUser = validateInitData(initData);
  if (!tgUser && DEV_MODE) tgUser = { id: Number(ADMIN_ID) || 1, first_name: "Dev", username: "dev" };
  if (!tgUser) return res.status(401).json({ error: "unauthorized" });
  const user = getOrCreateUser(tgUser);
  req.user = user;
  req.isAdmin = ADMIN_ID && String(user.tg_id) === ADMIN_ID;
  if (user.is_banned && !req.isAdmin && req.path !== "/me") return res.status(403).json({ error: "banned" });
  next();
}

// ===================================================================
//  YOUTUBE MUSIC (поиск + метаданные)
// ===================================================================
let _yt = null, _ytInit = null;
async function getYT() {
  if (_yt) return _yt;
  if (!_ytInit) {
    _ytInit = (async () => {
      const mod = await import("ytmusic-api");
      const YTMusic = mod.default || mod.YTMusic;
      const inst = new YTMusic();
      await inst.initialize();
      _yt = inst;
      return inst;
    })();
  }
  return _ytInit;
}
function pickCover(thumbs) {
  if (!thumbs || !thumbs.length) return "";
  let best = thumbs[thumbs.length - 1];
  let url = best && best.url ? best.url : "";
  // увеличиваем размер обложки если в URL есть =wNNN-hNNN
  return url.replace(/=w\d+-h\d+/, "=w544-h544");
}
function normSong(s) {
  const artists = (s.artists && s.artists.length) ? s.artists : (s.artist ? [s.artist] : []);
  const main = artists[0] ? artists[0].name : "";
  const feats = artists.slice(1).map(a => a.name).filter(Boolean);
  return { ytId: s.videoId, title: s.name, artist: main, feats: feats,
    cover: pickCover(s.thumbnails), duration: s.duration || 0,
    albumId: s.album ? s.album.albumId : null };
}
function normAlbum(a) {
  return { albumId: a.albumId, title: a.name, artist: a.artist ? a.artist.name : (a.artists && a.artists[0] ? a.artists[0].name : ""),
    cover: pickCover(a.thumbnails), year: a.year || "" };
}

// ===================================================================
//  СИНХРОНИЗИРОВАННЫЙ ТЕКСТ (lrclib.net)
// ===================================================================
function parseLrc(synced) {
  if (!synced) return [];
  const out = [];
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  synced.split("\n").forEach(function (ln) {
    let m; const times = []; re.lastIndex = 0;
    while ((m = re.exec(ln))) {
      const frac = m[3] ? parseFloat("0." + m[3]) : 0;
      times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac);
    }
    const text = ln.replace(re, "").trim();
    times.forEach(function (t) { if (text) out.push({ time: t, line: text }); });
  });
  out.sort(function (a, b) { return a.time - b.time; });
  return out;
}
async function fetchLyrics(artist, title, duration) {
  const base = "https://lrclib.net/api";
  const headers = { "User-Agent": "Dreinnify (https://github.com/dreinnify)" };
  try {
    let url = base + "/get?artist_name=" + encodeURIComponent(artist) + "&track_name=" + encodeURIComponent(title);
    if (duration) url += "&duration=" + Math.round(duration);
    let r = await fetch(url, { headers });
    let j = r.ok ? await r.json() : null;
    if (!j || (!j.syncedLyrics && !j.plainLyrics)) {
      const r2 = await fetch(base + "/search?q=" + encodeURIComponent((artist + " " + title).trim()), { headers });
      if (r2.ok) {
        const arr = await r2.json();
        if (Array.isArray(arr) && arr.length) {
          j = arr.find(function (x) { return x.syncedLyrics; }) || arr[0];
        }
      }
    }
    if (!j) return { lines: [], plain: "" };
    const lines = parseLrc(j.syncedLyrics);
    return { lines: lines, plain: j.plainLyrics || "" };
  } catch (e) { return { lines: [], plain: "" }; }
}

// ===================================================================
//  ХЕЛПЕРЫ КОНТЕНТА
// ===================================================================
function ensureTrack(t) {
  if (!t || !t.ytId) return null;
  let row = db.prepare("SELECT * FROM tracks WHERE yt_id=?").get(t.ytId);
  if (!row) {
    db.prepare("INSERT INTO tracks (yt_id,title,artist,feats,album_id,cover,duration,plays) VALUES (?,?,?,?,?,?,?,0)")
      .run(t.ytId, t.title || "", t.artist || "", JSON.stringify(t.feats || []), t.albumId || null, t.cover || "", t.duration || 0);
    row = db.prepare("SELECT * FROM tracks WHERE yt_id=?").get(t.ytId);
  }
  return row;
}
function ensureAlbum(a) {
  if (!a || !a.albumId) return null;
  let row = db.prepare("SELECT * FROM albums WHERE yt_id=?").get(a.albumId);
  if (!row) {
    db.prepare("INSERT INTO albums (yt_id,title,artist,cover,year) VALUES (?,?,?,?,?)")
      .run(a.albumId, a.title || "", a.artist || "", a.cover || "", String(a.year || ""));
    row = db.prepare("SELECT * FROM albums WHERE yt_id=?").get(a.albumId);
  }
  return row;
}
function trackOut(row) {
  return { ytId: row.yt_id, title: row.title, artist: row.artist, feats: JSON.parse(row.feats || "[]"),
    cover: row.cover, duration: row.duration, albumId: row.album_id, plays: row.plays };
}
function albumOut(row) {
  return { albumId: row.yt_id, title: row.title, artist: row.artist, cover: row.cover, year: row.year };
}
function getEditorial() {
  const rows = db.prepare("SELECT t.* FROM editorial e JOIN tracks t ON t.id=e.track_id ORDER BY e.position ASC, e.id ASC").all();
  return rows.map(trackOut);
}

// ===================================================================
//  EXPRESS ПРИЛОЖЕНИЕ + API
// ===================================================================
const app = express();
app.use(express.json({ limit: "1mb" }));

// Страница Mini-App
app.get("/", function (req, res) { res.set("Content-Type", "text/html; charset=utf-8").send(renderPage()); });
app.get("/health", function (req, res) { res.json({ ok: true }); });

// Всё под /api требует авторизации Telegram WebApp
app.use("/api", auth);

app.get("/api/config", function (req, res) { res.json({ domain: MINIAPP_DOMAIN }); });

// —— Профиль текущего пользователя
app.get("/api/me", function (req, res) {
  const u = req.user;
  res.json({ user: Object.assign(publicUser(u), { isAdmin: !!req.isAdmin, banned: !!u.is_banned }) });
});
app.post("/api/me", function (req, res) {
  const b = req.body || {};
  const u = req.user;
  const name = (b.name != null ? String(b.name).slice(0, 60) : u.name);
  const bio = (b.bio != null ? String(b.bio).slice(0, 300) : u.bio);
  const avatar = (b.avatar != null ? String(b.avatar).slice(0, 500) : u.avatar);
  const hap = (b.haptic_enabled != null ? (b.haptic_enabled ? 1 : 0) : u.haptic_enabled);
  db.prepare("UPDATE users SET name=?, bio=?, avatar=?, haptic_enabled=? WHERE id=?").run(name, bio, avatar, hap, u.id);
  const fresh = db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
  res.json({ user: Object.assign(publicUser(fresh), { isAdmin: !!req.isAdmin, banned: !!fresh.is_banned }) });
});

// —— Главная: блок «Выбрано редакцией» + до 10 популярных
app.get("/api/home", async function (req, res) {
  try {
    const enabled = getSetting("editorial_enabled", "1") === "1";
    const editorial = { enabled: enabled, items: enabled ? getEditorial() : [] };
    let list = db.prepare("SELECT * FROM tracks ORDER BY plays DESC, id DESC LIMIT 10").all().map(trackOut);
    if (list.length < 4) {
      try {
        const y = await getYT();
        const songs = await y.searchSongs("русский рэп хиты");
        list = (songs || []).slice(0, 10).map(normSong);
      } catch (e) { /* оффлайн / нет сети */ }
    }
    res.json({ editorial: editorial, list: list });
  } catch (e) { res.json({ editorial: { enabled: false, items: [] }, list: [] }); }
});

// —— Поиск (треки + альбомы)
app.get("/api/search", async function (req, res) {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ songs: [], albums: [] });
  try {
    const y = await getYT();
    const [songs, albums] = await Promise.all([
      y.searchSongs(q).catch(function () { return []; }),
      y.searchAlbums(q).catch(function () { return []; })
    ]);
    res.json({
      songs: (songs || []).slice(0, 25).map(normSong).filter(function (t) { return t.ytId; }),
      albums: (albums || []).slice(0, 12).map(normAlbum).filter(function (a) { return a.albumId; })
    });
  } catch (e) { res.json({ error: "yt", songs: [], albums: [] }); }
});

// —— Альбом
app.get("/api/album/:id", async function (req, res) {
  try {
    const y = await getYT();
    const a = await y.getAlbum(req.params.id);
    if (!a) return res.json({ error: "notfound" });
    const cover = pickCover(a.thumbnails);
    const album = { albumId: req.params.id, title: a.name, artist: a.artist ? a.artist.name : "", cover: cover, year: a.year || "" };
    const tracks = (a.songs || []).map(function (s) {
      const n = normSong(s); if (!n.cover) n.cover = cover; if (!n.artist) n.artist = album.artist; n.albumId = req.params.id; return n;
    }).filter(function (t) { return t.ytId; });
    res.json({ album: album, tracks: tracks });
  } catch (e) { res.json({ error: "yt" }); }
});

// —— Один трек (метаданные)
app.get("/api/track/:id", async function (req, res) {
  const row = db.prepare("SELECT * FROM tracks WHERE yt_id=?").get(req.params.id);
  if (row) return res.json({ track: trackOut(row) });
  try { const y = await getYT(); const s = await y.getSong(req.params.id); res.json({ track: normSong(s) }); }
  catch (e) { res.json({ error: "notfound" }); }
});

// —— Аудио-поток (полный, без 30-сек ограничения)
app.get("/api/stream/:id", function (req, res) {
  const id = req.params.id;
  if (!/^[\w-]{6,15}$/.test(id)) return res.status(400).end();
  const url = "https://www.youtube.com/watch?v=" + id;
  try {
    db.prepare("UPDATE tracks SET plays = plays + 1 WHERE yt_id=?").run(id);
    res.setHeader("Content-Type", "audio/webm");
    res.setHeader("Cache-Control", "no-store");
    const stream = ytdl(url, { filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 });
    stream.on("error", function (err) { console.error("stream error", err && err.message); if (!res.headersSent) res.status(502).end(); else res.end(); });
    req.on("close", function () { try { stream.destroy(); } catch (e) {} });
    stream.pipe(res);
  } catch (e) { if (!res.headersSent) res.status(500).end(); }
});

// —— Синхронизированный текст
app.get("/api/lyrics/:id", async function (req, res) {
  const artist = String(req.query.artist || "");
  const title = String(req.query.title || "");
  const row = db.prepare("SELECT duration FROM tracks WHERE yt_id=?").get(req.params.id);
  const dur = row ? row.duration : 0;
  const r = await fetchLyrics(artist, title, dur);
  res.json({ lines: r.lines, hasPlain: !!r.plain });
});

// —— Счётчик прослушиваний + регистрация трека
app.post("/api/play", function (req, res) { ensureTrack((req.body || {}).track); res.json({ ok: true }); });

// —— Лайки
app.post("/api/like", function (req, res) {
  const b = req.body || {};
  let type, targetId;
  if (b.type === "album" && b.album) { ensureAlbum(b.album); type = "album"; targetId = b.album.albumId; }
  else if (b.track) { ensureTrack(b.track); type = "track"; targetId = b.track.ytId; }
  else return res.json({ error: "bad" });
  if (!targetId) return res.json({ error: "bad" });
  const exists = db.prepare("SELECT id FROM likes WHERE user_id=? AND target_type=? AND target_id=?").get(req.user.id, type, targetId);
  if (exists) { db.prepare("DELETE FROM likes WHERE id=?").run(exists.id); return res.json({ liked: false }); }
  db.prepare("INSERT INTO likes (user_id,target_type,target_id,created_at) VALUES (?,?,?,?)").run(req.user.id, type, targetId, Date.now());
  res.json({ liked: true });
});
app.get("/api/likes", function (req, res) {
  const tracks = db.prepare("SELECT t.* FROM likes l JOIN tracks t ON t.yt_id=l.target_id WHERE l.user_id=? AND l.target_type='track' ORDER BY l.created_at DESC").all(req.user.id).map(trackOut);
  const albums = db.prepare("SELECT a.* FROM likes l JOIN albums a ON a.yt_id=l.target_id WHERE l.user_id=? AND l.target_type='album' ORDER BY l.created_at DESC").all(req.user.id).map(albumOut);
  res.json({ tracks: tracks, albums: albums });
});

// —— Плейлисты
app.get("/api/playlists", function (req, res) {
  const pls = db.prepare("SELECT p.*, (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) AS count FROM playlists p WHERE owner_id=? ORDER BY created_at DESC").all(req.user.id);
  res.json({ playlists: pls });
});
app.post("/api/playlists", function (req, res) {
  const name = String((req.body || {}).name || "").trim().slice(0, 80) || "Новый плейлист";
  const info = db.prepare("INSERT INTO playlists (owner_id,name,created_at) VALUES (?,?,?)").run(req.user.id, name, Date.now());
  res.json({ id: info.lastInsertRowid });
});
app.get("/api/playlist/:id", function (req, res) {
  const p = db.prepare("SELECT * FROM playlists WHERE id=?").get(req.params.id);
  if (!p) return res.json({ error: "notfound" });
  if (p.owner_id !== req.user.id && !p.is_public) return res.json({ error: "forbidden" });
  const tracks = db.prepare("SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? ORDER BY pt.position ASC, pt.id ASC").all(p.id).map(trackOut);
  res.json({ playlist: p, tracks: tracks });
});
app.delete("/api/playlist/:id", function (req, res) {
  const p = db.prepare("SELECT * FROM playlists WHERE id=?").get(req.params.id);
  if (!p || p.owner_id !== req.user.id) return res.json({ error: "forbidden" });
  db.prepare("DELETE FROM playlist_tracks WHERE playlist_id=?").run(p.id);
  db.prepare("DELETE FROM playlists WHERE id=?").run(p.id);
  res.json({ ok: true });
});
app.post("/api/playlist/:id/tracks", function (req, res) {
  const p = db.prepare("SELECT * FROM playlists WHERE id=?").get(req.params.id);
  if (!p || p.owner_id !== req.user.id) return res.json({ error: "forbidden" });
  const tr = ensureTrack((req.body || {}).track);
  if (!tr) return res.json({ error: "bad" });
  const dup = db.prepare("SELECT id FROM playlist_tracks WHERE playlist_id=? AND track_id=?").get(p.id, tr.id);
  if (dup) return res.json({ status: "duplicate" });
  const max = db.prepare("SELECT COALESCE(MAX(position),0) AS m FROM playlist_tracks WHERE playlist_id=?").get(p.id).m;
  db.prepare("INSERT INTO playlist_tracks (playlist_id,track_id,position) VALUES (?,?,?)").run(p.id, tr.id, max + 1);
  if (!p.cover && tr.cover) db.prepare("UPDATE playlists SET cover=? WHERE id=?").run(tr.cover, p.id);
  res.json({ status: "added" });
});
app.delete("/api/playlist/:id/tracks/:ytId", function (req, res) {
  const p = db.prepare("SELECT * FROM playlists WHERE id=?").get(req.params.id);
  if (!p || p.owner_id !== req.user.id) return res.json({ error: "forbidden" });
  const tr = db.prepare("SELECT id FROM tracks WHERE yt_id=?").get(req.params.ytId);
  if (tr) db.prepare("DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?").run(p.id, tr.id);
  res.json({ ok: true });
});

// —— Рецензии (макс 90 баллов = сумма 6 критериев × 3)
const CRIT_KEYS = ["rarity", "integrity", "depth", "realization", "charisma", "relevance"];
app.post("/api/review", function (req, res) {
  const b = req.body || {};
  const tr = ensureTrack(b.track);
  if (!tr) return res.json({ error: "bad" });
  const vals = {};
  let sum = 0;
  CRIT_KEYS.forEach(function (k) { let v = parseInt(b[k], 10); if (isNaN(v) || v < 1) v = 1; if (v > 5) v = 5; vals[k] = v; sum += v; });
  const total = sum * 3; // макс (5×6)×3 = 90
  const text = String(b.text || "").slice(0, 1000);
  db.prepare("INSERT INTO reviews (user_id,track_id,rarity,integrity,depth,realization,charisma,relevance,total,text,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,track_id) DO UPDATE SET rarity=excluded.rarity,integrity=excluded.integrity,depth=excluded.depth,realization=excluded.realization,charisma=excluded.charisma,relevance=excluded.relevance,total=excluded.total,text=excluded.text,created_at=excluded.created_at")
    .run(req.user.id, tr.id, vals.rarity, vals.integrity, vals.depth, vals.realization, vals.charisma, vals.relevance, total, text, Date.now());
  res.json({ total: total });
});
app.get("/api/track/:id/reviews", function (req, res) {
  const tr = db.prepare("SELECT id FROM tracks WHERE yt_id=?").get(req.params.id);
  if (!tr) return res.json({ reviews: [], average: 0 });
  const rows = db.prepare("SELECT r.*, u.name AS author, u.is_verified, u.is_author FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.track_id=? ORDER BY r.created_at DESC").all(tr.id);
  const avg = rows.length ? Math.round(rows.reduce(function (a, r) { return a + r.total; }, 0) / rows.length) : 0;
  res.json({ reviews: rows, average: avg });
});

// —— Профиль (свой или чужой)
app.get("/api/profile/:id?", function (req, res) {
  let u;
  if (!req.params.id || req.params.id === "null" || String(req.params.id) === String(req.user.id)) u = req.user;
  else u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.json({ error: "notfound" });
  const tracks = db.prepare("SELECT t.* FROM likes l JOIN tracks t ON t.yt_id=l.target_id WHERE l.user_id=? AND l.target_type='track' ORDER BY l.created_at DESC LIMIT 20").all(u.id).map(trackOut);
  const likedCount = db.prepare("SELECT COUNT(*) AS c FROM likes WHERE user_id=?").get(u.id).c;
  const playlistCount = db.prepare("SELECT COUNT(*) AS c FROM playlists WHERE owner_id=?").get(u.id).c;
  const reviews = db.prepare("SELECT r.*, t.title AS trackTitle FROM reviews r JOIN tracks t ON t.id=r.track_id WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 20").all(u.id);
  res.json({ user: publicUser(u), tracks: tracks, reviews: reviews, likedCount: likedCount, playlistCount: playlistCount, reviewCount: reviews.length });
});

// ===================================================================
//  АДМИН-ПАНЕЛЬ (только ADMIN_ID)
// ===================================================================
function adminOnly(req, res, next) { if (!req.isAdmin) return res.status(403).json({ error: "forbidden" }); next(); }
app.get("/api/admin/stats", adminOnly, function (req, res) {
  res.json({
    users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    tracks: db.prepare("SELECT COUNT(*) AS c FROM tracks").get().c,
    plays: db.prepare("SELECT COALESCE(SUM(plays),0) AS c FROM tracks").get().c,
    likes: db.prepare("SELECT COUNT(*) AS c FROM likes").get().c,
    reviews: db.prepare("SELECT COUNT(*) AS c FROM reviews").get().c,
    banned: db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_banned=1").get().c,
    editorialEnabled: getSetting("editorial_enabled", "1") === "1",
    editorial: getEditorial()
  });
});
app.get("/api/admin/users", adminOnly, function (req, res) {
  const q = String(req.query.q || "").trim();
  let rows;
  if (q) rows = db.prepare("SELECT * FROM users WHERE name LIKE ? OR tg_id LIKE ? OR username LIKE ? ORDER BY created_at DESC LIMIT 50").all("%" + q + "%", "%" + q + "%", "%" + q + "%");
  else rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 50").all();
  res.json({ users: rows.map(publicUser) });
});
app.post("/api/admin/user", adminOnly, function (req, res) {
  const b = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(b.userId);
  if (!u) return res.json({ error: "notfound" });
  if (b.action === "ban") db.prepare("UPDATE users SET is_banned=1 WHERE id=?").run(u.id);
  else if (b.action === "unban") db.prepare("UPDATE users SET is_banned=0 WHERE id=?").run(u.id);
  else if (b.action === "verify") db.prepare("UPDATE users SET is_verified=? WHERE id=?").run(b.value ? 1 : 0, u.id);
  else if (b.action === "author") db.prepare("UPDATE users SET is_author=? WHERE id=?").run(b.value ? 1 : 0, u.id);
  res.json({ ok: true });
});
app.post("/api/admin/editorial/add", adminOnly, function (req, res) {
  const tr = ensureTrack((req.body || {}).track);
  if (!tr) return res.json({ error: "bad" });
  const max = db.prepare("SELECT COALESCE(MAX(position),0) AS m FROM editorial").get().m;
  db.prepare("INSERT INTO editorial (track_id,position) VALUES (?,?) ON CONFLICT(track_id) DO NOTHING").run(tr.id, max + 1);
  res.json({ ok: true });
});
app.post("/api/admin/editorial/remove", adminOnly, function (req, res) {
  const tr = db.prepare("SELECT id FROM tracks WHERE yt_id=?").get((req.body || {}).ytId);
  if (tr) db.prepare("DELETE FROM editorial WHERE track_id=?").run(tr.id);
  res.json({ ok: true });
});
app.post("/api/admin/editorial/toggle", adminOnly, function (req, res) {
  setSetting("editorial_enabled", (req.body || {}).enabled ? "1" : "0");
  res.json({ ok: true });
});

// ===================================================================
//  TELEGRAM БОТ
// ===================================================================
let bot = null;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  bot.start(async function (ctx) {
    try { getOrCreateUser(ctx.from); } catch (e) {}
    const text = "🎵 Добро пожаловать в *Dreinnify*\n\nСовременный музыкальный плеер: треки, альбомы, плейлисты, синхронизированный текст и рецензии.\n\nОткрой приложение кнопкой ниже 👇";
    if (MINIAPP_DOMAIN) {
      await ctx.reply(text, Object.assign({ parse_mode: "Markdown" },
        Markup.keyboard([[Markup.button.webApp("🎧 Открыть Dreinnify", MINIAPP_DOMAIN)]]).resize()));
    } else {
      await ctx.reply(text + "\n\n⚠️ Админу: задайте MINIAPP_DOMAIN в .env", { parse_mode: "Markdown" });
    }
  });
  bot.command("stats", function (ctx) {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const u = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    const t = db.prepare("SELECT COUNT(*) AS c FROM tracks").get().c;
    const p = db.prepare("SELECT COALESCE(SUM(plays),0) AS c FROM tracks").get().c;
    ctx.reply("📊 Статистика\nПользователи: " + u + "\nТреки: " + t + "\nПрослушивания: " + p);
  });
  bot.command("app", function (ctx) {
    if (MINIAPP_DOMAIN) ctx.reply("Открыть плеер:", Markup.inlineKeyboard([[Markup.button.webApp("🎧 Dreinnify", MINIAPP_DOMAIN)]]));
  });
}

// ===================================================================
//  ЗАПУСК
// ===================================================================
async function start() {
  app.listen(PORT, function () { console.log("✅ Mini-App и API запущены на порту " + PORT + (MINIAPP_DOMAIN ? ("  (домен: " + MINIAPP_DOMAIN + ")") : "")); });
  if (bot) {
    try {
      await bot.launch();
      console.log("✅ Telegram-бот запущен");
      if (MINIAPP_DOMAIN) {
        bot.telegram.setChatMenuButton({ menuButton: { type: "web_app", text: "Dreinnify", web_app: { url: MINIAPP_DOMAIN } } })
          .catch(function (e) { console.warn("setChatMenuButton:", e && e.message); });
      }
    } catch (e) { console.error("❌ Ошибка запуска бота:", e && e.message); }
  }
  process.once("SIGINT", function () { if (bot) bot.stop("SIGINT"); process.exit(0); });
  process.once("SIGTERM", function () { if (bot) bot.stop("SIGTERM"); process.exit(0); });
}
start();
