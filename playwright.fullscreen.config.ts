import {defineConfig} from '@playwright/test';
import base from './playwright.tutorial.config';
export default defineConfig({...base,testMatch:'fullscreen.spec.ts',reporter:[['list'],['json',{outputFile:'evidence/fullscreen-e2e-results.json'}]],outputDir:'work/fullscreen-playwright-results'});
