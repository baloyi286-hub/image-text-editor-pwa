import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({ plugins: [react(), VitePWA({registerType:'autoUpdate',includeAssets:['icon.svg'],manifest:{name:'PixelType Image Text Editor',short_name:'PixelType',description:'Edit text in images',theme_color:'#101a16',background_color:'#101a16',display:'standalone',start_url:'/',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}})] });
