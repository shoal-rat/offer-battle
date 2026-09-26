import {defineConfig} from '@playwright/test';
import base from './playwright.config';
import {resolve} from 'node:path';
export default defineConfig({...base,testMatch:'tutorial.spec.ts',reporter:[['list'],['json',{outputFile:'evidence/tutorial-e2e-results.json'}]],use:{...base.use,baseURL:'http://127.0.0.1:5182'},outputDir:'work/tutorial-playwright-results',webServer:{command:'npm start',url:'http://127.0.0.1:5182/healthz',timeout:60000,reuseExistingServer:false,env:{PORT:'5182',HOST:'127.0.0.1',DATA_DIR:resolve('work/tutorial-e2e-data'),TURN_MS:'30000'}}});
