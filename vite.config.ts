import { defineConfig, loadEnv } from 'vite';
import { createDeploymentUrls } from './src/deployment.ts';
export default defineConfig(({mode}) => {
 const env=loadEnv(mode,process.cwd(),'VITE_');
 const {base}=createDeploymentUrls({basePath:env.VITE_BASE_PATH,apiBaseUrl:env.VITE_API_BASE_URL});
 return {base,build:{outDir:'dist',sourcemap:env.VITE_STATIC_MODE!=='true'},server:{host:'127.0.0.1',watch:{ignored:['**/evidence/**','**/work/**','**/data/**','**/assets/**','**/tests/**','**/spec/**']}},resolve:{dedupe:['react','react-dom']}};
});
