import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './styles/paper.css';
import './styles/paper-edges.css';
import './styles/card-layout.css';
import './styles/paper-tokens.css';
import './styles/papercraft.css';
import '@chinese-fonts/xiaolai/dist/Xiaolai/result.css';
import './styles/pencil.css';
import {loadArtManifest} from './assets';
document.documentElement.dataset.theme='paper-office';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
// The interaction shell never waits for illustration metadata.
void loadArtManifest().catch(()=>console.warn('资源清单读取失败，继续使用同主题备用素材'));
