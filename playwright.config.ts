import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({
 testDir:'./tests/e2e',timeout:120000,expect:{timeout:10000,toHaveScreenshot:{animations:'disabled',maxDiffPixelRatio:0.01}},fullyParallel:false,workers:1,retries:0,
 reporter:[['list'],['html',{outputFolder:'evidence/playwright-report',open:'never'}],['json',{outputFile:'evidence/e2e-results.json'}]],
 use:{baseURL:'http://127.0.0.1:5180',browserName:'chromium',...(process.env.PW_CHANNEL?{channel:process.env.PW_CHANNEL}:{}),viewport:{width:1440,height:900},locale:'zh-CN',colorScheme:'dark',reducedMotion:'reduce',actionTimeout:15000,trace:'retain-on-failure',screenshot:'only-on-failure'},
 outputDir:'work/playwright-results',
 webServer:{command:process.env.E2E_PRODUCTION?'npm start':'npm run dev',url:'http://127.0.0.1:5180/healthz',timeout:60000,reuseExistingServer:!process.env.CI,env:{PORT:'5180',HOST:'127.0.0.1',DATA_DIR:resolve('work/e2e-data'),TURN_MS:'30000'}},
});
