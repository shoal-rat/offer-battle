import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import {loadArtManifest,resolveAsset} from './assets';
async function boot(){try{await loadArtManifest()}catch{console.warn('资源清单读取失败，使用随包提供的默认素材路径')}
 for(const [name,id,path] of [['home','background_home','/assets/background-home.webp'],['board','background_table','/assets/background-board.webp']])document.documentElement.style.setProperty('--art-'+name,`url("${resolveAsset(id,path)}")`);
 createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);}
void boot();
