import {defineConfig} from '@playwright/test';

const port=Number(process.env.STATIC_TEST_PORT||5194);
const externalUrl=process.env.STATIC_TEST_URL;
const baseURL=externalUrl||`http://127.0.0.1:${port}/offer-battle/`;
export default defineConfig({
  testDir:'./tests/static',timeout:120000,expect:{timeout:10000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['html',{outputFolder:'evidence/static-playwright-report',open:'never'}],['json',{outputFile:'evidence/static-e2e-results.json'}]],
  use:{baseURL,browserName:'chromium',...(process.env.PW_CHANNEL?{channel:process.env.PW_CHANNEL}:{}),viewport:{width:1440,height:900},locale:'zh-CN',colorScheme:'dark',reducedMotion:'reduce',actionTimeout:15000,trace:'retain-on-failure',screenshot:'only-on-failure'},
  outputDir:'work/static-playwright-results',
  webServer:externalUrl?undefined:{
    command:`node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,url:baseURL,timeout:60000,reuseExistingServer:!process.env.CI,
    env:{VITE_STATIC_MODE:'true',VITE_BASE_PATH:'/offer-battle/',VITE_API_BASE_URL:process.env.E2E_CLOUD_URL||'http://127.0.0.1:5199'},
  },
});
