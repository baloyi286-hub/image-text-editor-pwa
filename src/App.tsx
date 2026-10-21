import {useEffect,useRef,useState} from 'react';
import {Canvas,FabricImage,IText,Rect,FabricObject} from 'fabric';
import {createWorker} from 'tesseract.js';
import {Upload,ScanText,Type,Download,Undo2,Redo2,Trash2,ImagePlus,Eye,EyeOff} from 'lucide-react';
type Detection={text:string;left:number;top:number;width:number;height:number};
export default function App(){
 const element=useRef<HTMLCanvasElement>(null),editor=useRef<Canvas|null>(null),source=useRef<HTMLImageElement|null>(null),fileInput=useRef<HTMLInputElement>(null),canvasWrap=useRef<HTMLDivElement>(null);
 const fitCanvas=()=>{const c=editor.current,wrap=canvasWrap.current;if(!c||!wrap||!source.current)return;const availableWidth=Math.max(100,wrap.clientWidth-20),availableHeight=Math.max(180,wrap.clientHeight-20);const scale=Math.min(1,availableWidth/c.width,availableHeight/c.height);c.setDimensions({width:Math.max(1,Math.round(c.width*scale)),height:Math.max(1,Math.round(c.height*scale))},{cssOnly:true});c.calcOffset();};
 const [pendingRegion,setPendingRegion]=useState<Detection|null>(null);
 const [panel,setPanel]=useState<'font'|'style'|'position'|'tools'>('font');
 const [fontCategory,setFontCategory]=useState('All');
 const [strokeColor,setStrokeColor]=useState('#000000'),[strokeSize,setStrokeSize]=useState(0),[spacing,setSpacing]=useState(0);
 const fonts:Record<string,string[]>={Sans:['Arial','Helvetica','Verdana','Tahoma','Trebuchet MS','Segoe UI'],Serif:['Georgia','Times New Roman','Palatino Linotype','Garamond'],Display:['Impact','Arial Black','Comic Sans MS'],Mono:['Courier New','Lucida Console']};
 const fontChoices=fontCategory==='All'?Object.values(fonts).flat():fonts[fontCategory]||fonts.Sans;
 const [aiEnabled,setAiEnabled]=useState(Boolean(import.meta.env.VITE_AI_API_URL));
 const aiEnabledRef=useRef(aiEnabled);aiEnabledRef.current=aiEnabled;
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Upload an image to begin'),[selected,setSelected]=useState<IText|null>(null);
 const [value,setValue]=useState(''),[color,setColor]=useState('#ffffff'),[font,setFont]=useState('Arial'),[size,setSize]=useState(36),[opacity,setOpacity]=useState(100),[angle,setAngle]=useState(0),[showOriginal,setShowOriginal]=useState(true);
 const [history,setHistory]=useState<string[]>([]),[historyIndex,setHistoryIndex]=useState(-1),historyRef=useRef<string[]>([]),indexRef=useRef(-1),restoring=useRef(false);
 useEffect(()=>{if(!element.current)return;const c=new Canvas(element.current,{width:960,height:540,backgroundColor:'#202c28',preserveObjectStacking:true,enableRetinaScaling:false});editor.current=c;
 const sync=()=>{const o=c.getActiveObject();if(o instanceof IText){setSelected(o);setValue(o.text||'');setColor(typeof o.fill==='string'?o.fill:'#ffffff');setFont(o.fontFamily||'Arial');setSize(o.fontSize||36);setOpacity(Math.round((o.opacity||1)*100));setAngle(o.angle||0);setStrokeColor(typeof o.stroke==='string'?o.stroke:'#000000');setStrokeSize(o.strokeWidth||0);setSpacing(o.charSpacing||0);setPanel('font')}else setSelected(null)};
 const resizeObserver=new ResizeObserver(()=>fitCanvas());if(canvasWrap.current)resizeObserver.observe(canvasWrap.current);
 c.on('selection:created',sync);c.on('selection:updated',sync);c.on('selection:cleared',sync);
 c.on('mouse:down',event=>{const target=event.target;if(target instanceof Rect && (target as Rect & {ocrText?:string}).ocrText){const region=target as Rect & {ocrText?:string;ocrDetection?:Detection};if(!region.ocrDetection)return;const detection=region.ocrDetection;setPendingRegion(detection);setValue(detection.text);setSelected(null);setMessage('Original text preserved. Edit below, then apply the replacement only when ready.');}});
 c.on('mouse:dblclick',event=>{const target=event.target;if(target instanceof IText){c.setActiveObject(target);target.enterEditing();target.selectAll();target.hiddenTextarea?.focus();c.requestRenderAll()}});
 const changed=()=>save();c.on('object:modified',changed);c.on('text:changed',changed);c.on('object:added',changed);c.on('object:removed',changed);
 return()=>{resizeObserver.disconnect();editor.current=null;void c.dispose()}},[]);
 function save(){const c=editor.current;if(!c||restoring.current)return;const snapshot=JSON.stringify(c.toJSON());if(historyRef.current[indexRef.current]===snapshot)return;const next=[...historyRef.current.slice(0,indexRef.current+1),snapshot].slice(-35);historyRef.current=next;indexRef.current=next.length-1;setHistory(next);setHistoryIndex(indexRef.current)}
 async function restore(i:number){const c=editor.current;if(!c||i<0||i>=historyRef.current.length)return;restoring.current=true;await c.loadFromJSON(historyRef.current[i]);c.renderAll();indexRef.current=i;setHistoryIndex(i);setSelected(null);restoring.current=false}
 function update(props:Partial<IText>){if(!selected)return;selected.set(props);selected.setCoords();editor.current?.requestRenderAll();save()}
 async function upload(file?:File){
 if(!file){setMessage('No photo was selected.');return;}
 setBusy(true);setMessage('Reading selected photo…');
 try{
  // iOS Photos can supply image formats whose MIME type is blank or generic.
  // Read the actual selected file once and retain its decoded pixels for OCR.
  const bytes=await file.arrayBuffer();
  if(!bytes.byteLength)throw new Error('The selected photo is empty');
  const blob=new Blob([bytes],{type:file.type||'application/octet-stream'});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  try{
   await new Promise<void>((resolve,reject)=>{
    img.onload=()=>resolve();
    img.onerror=()=>reject(new Error('Browser could not decode this image. Try exporting it as JPEG or PNG.'));
    img.src=url;
   });
   if(!img.naturalWidth||!img.naturalHeight)throw new Error('Image dimensions unavailable');
   const c=editor.current;
   if(!c)throw new Error('Editor is not ready');
   setMessage('Displaying selected photo…');
   const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
   const w=Math.max(1,Math.round(img.naturalWidth*scale));
   const h=Math.max(1,Math.round(img.naturalHeight*scale));
   // Set the Fabric backing store before adding the image. Do not revoke the
   // URL while the original HTMLImageElement is used by the editor.
   const background=new FabricImage(img,{left:0,top:0,scaleX:w/img.naturalWidth,scaleY:h/img.naturalHeight,selectable:false,evented:false});
   c.clear();
   c.setDimensions({width:w,height:h});
   c.add(background);
   c.sendObjectToBack(background);
   source.current=img;
   c.requestRenderAll();
   setLoaded(true);setPendingRegion(null);setSelected(null);
   setShowOriginal(true);
   historyRef.current=[];indexRef.current=-1;save();
   requestAnimationFrame(()=>{fitCanvas();c.requestRenderAll()});
   setMessage('Image loaded ('+img.naturalWidth+' × '+img.naturalHeight+'). Tap Detect to select text.');
  }finally{
   // Keep image pixels alive; the decoded element remains available after URL revocation.
   URL.revokeObjectURL(url);
  }
 }catch(e){
  console.error('PixelType photo upload:',e);
  setMessage('Upload failed: '+(e instanceof Error?e.message:String(e)));
 }finally{setBusy(false)}
}

 function sampleAppearance(d:Detection){
 const img=source.current!,c=editor.current!;
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
 const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);
 const sx=img.naturalWidth/c.width,sy=img.naturalHeight/c.height;
 const x0=Math.max(0,Math.floor(d.left*sx)),y0=Math.max(0,Math.floor(d.top*sy));
 const x1=Math.min(img.naturalWidth,Math.ceil((d.left+d.width)*sx)),y1=Math.min(img.naturalHeight,Math.ceil((d.top+d.height)*sy));
 const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 const rgb=(x:number,y:number)=>{const i=(Math.max(0,Math.min(canvas.height-1,y))*canvas.width+Math.max(0,Math.min(canvas.width-1,x)))*4;return [data[i],data[i+1],data[i+2]]};
 const samples:number[][]=[];
 for(let i=0;i<12;i++){
  const tx=Math.round(x0+(x1-x0)*(i+.5)/12),ty=Math.round(y0+(y1-y0)*(i+.5)/12);
  samples.push(rgb(tx,Math.max(0,y0-3)),rgb(tx,Math.min(canvas.height-1,y1+3)),rgb(Math.max(0,x0-3),ty),rgb(Math.min(canvas.width-1,x1+3),ty));
 }
 const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const bg=[0,1,2].map(k=>median(samples.map(p=>p[k])));
 const dist=(p:number[])=>Math.hypot(...p.map((v,k)=>v-bg[k]));
 const histogram=new Map<string,{rgb:number[];count:number}>();
 let foregroundPixels=0,occupied=0,transitions=0;
 for(let y=y0;y<y1;y+=Math.max(1,Math.floor(sy)))for(let x=x0;x<x1;x+=Math.max(1,Math.floor(sx))){
  const p=rgb(x,y),distance=dist(p);if(distance<45)continue;
  foregroundPixels++;
  const key=p.map(v=>Math.round(v/24)*24).join(',');
  const entry=histogram.get(key)||{rgb:p,count:0};entry.count++;histogram.set(key,entry);
 }
 const candidates=[...histogram.values()].sort((a,b)=>b.count-a.count);
 const fg=candidates[0]?.rgb||[0,0,0];
 for(let y=y0;y<y1;y+=Math.max(1,Math.round(sy*2))){
  let prev=false;
  for(let x=x0;x<x1;x+=Math.max(1,Math.round(sx*2))){
   const active=dist(rgb(x,y))>65;
   if(active)occupied++;
   if(active!==prev)transitions++;
   prev=active;
  }
 }
 const fillRatio=foregroundPixels/Math.max(1,(x1-x0)*(y1-y0)/(Math.max(1,Math.floor(sx))*Math.max(1,Math.floor(sy))));
 const hasOutline=candidates.length>1 && candidates.slice(1,4).some(v=>v.count>foregroundPixels*.07 && Math.hypot(...v.rgb.map((n,k)=>n-fg[k]))>110);
 const hex=(p:number[])=>'#'+p.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
 const strokeColor=candidates.slice(1).find(v=>Math.hypot(...v.rgb.map((n,k)=>n-fg[k]))>110)?.rgb||[0,0,0];
 return {background:hex(bg),foreground:hex(fg),outline:hasOutline?hex(strokeColor):undefined,weight:fillRatio>.30?'bold':'normal',fillRatio,transitions,occupied};
 }

 function restoreBackground(d:Detection){
 const img=source.current!,c=editor.current!;
 const sx=img.naturalWidth/c.width,sy=img.naturalHeight/c.height;
 const pad=Math.max(2,Math.ceil(d.height*.13));
 const left=Math.max(0,Math.floor(d.left-pad)),top=Math.max(0,Math.floor(d.top-pad));
 const right=Math.min(c.width,Math.ceil(d.left+d.width+pad)),bottom=Math.min(c.height,Math.ceil(d.top+d.height+pad));
 const w=Math.max(1,Math.ceil(right-left)),h=Math.max(1,Math.ceil(bottom-top));
 const raw=document.createElement('canvas');raw.width=img.naturalWidth;raw.height=img.naturalHeight;
 const rawCtx=raw.getContext('2d')!;rawCtx.drawImage(img,0,0);
 const src=rawCtx.getImageData(0,0,raw.width,raw.height).data;
 const sample=(x:number,y:number,k:number)=>{
  const px=Math.max(0,Math.min(raw.width-1,Math.round(x*sx)));
  const py=Math.max(0,Math.min(raw.height-1,Math.round(y*sy)));
  return src[(py*raw.width+px)*4+k];
 };
 const patch=document.createElement('canvas');patch.width=w;patch.height=h;
 const ctx=patch.getContext('2d')!,out=ctx.createImageData(w,h);
 const x0=d.left-1,x1=d.left+d.width+1,y0=d.top-1,y1=d.top+d.height+1;
 for(let py=0;py<h;py++)for(let px=0;px<w;px++){
  const x=left+px,y=top+py,i=(py*w+px)*4;
  const tx=Math.max(0,Math.min(1,(x-x0)/Math.max(1,x1-x0)));
  const ty=Math.max(0,Math.min(1,(y-y0)/Math.max(1,y1-y0)));
  const dx=Math.min(Math.abs(x-x0),Math.abs(x-x1));
  const dy=Math.min(Math.abs(y-y0),Math.abs(y-y1));
  const wx=1/Math.max(1,dx),wy=1/Math.max(1,dy);
  for(let k=0;k<3;k++){
   const horizontal=sample(x0,y,k)*(1-tx)+sample(x1,y,k)*tx;
   const vertical=sample(x,y0,k)*(1-ty)+sample(x,y1,k)*ty;
   const reconstructed=(horizontal*wx+vertical*wy)/(wx+wy);
   const original=sample(x,y,k);
   const edge=Math.min(x-x0,x1-x,y-y0,y1-y);
   const blend=Math.max(0,Math.min(1,(edge+1)/Math.max(1,pad*.45)));
   out.data[i+k]=Math.round(original*(1-blend)+reconstructed*blend);
  }
  out.data[i+3]=255;
 }
 ctx.putImageData(out,0,0);
 const layer=new FabricImage(patch,{left,top,selectable:false,evented:false});
 c.add(layer);
 }
 async function createReplacement(d:Detection,replacementText?:string){
 const c=editor.current!;
 const appearance=sampleAppearance(d);
 // Only the clicked OCR region is changed. For flat-colour graphics, a
 // uniform cover avoids sampling characters from unrelated nearby artwork.
 const pad=Math.max(1,Math.min(3,d.height*.035));
 const cover=new Rect({left:Math.max(0,d.left-pad),top:Math.max(0,d.top-pad),width:d.width+pad*2,height:d.height+pad*2,fill:appearance.background,selectable:false,evented:false});
 if(aiEnabledRef.current && import.meta.env.VITE_AI_API_URL){
   try{
     setMessage('Restoring selected text background using the image service…');
     const img=source.current!;
     const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
     canvas.getContext('2d')!.drawImage(img,0,0);
     const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image encoding failed')),'image/png'));
     const sx=img.naturalWidth/c.width,sy=img.naturalHeight/c.height;
     const form=new FormData();form.append('image',blob,'source.png');
     form.append('x',String(d.left*sx));form.append('y',String(d.top*sy));
     form.append('width',String(d.width*sx));form.append('height',String(d.height*sy));
     const endpoint=String(import.meta.env.VITE_AI_API_URL).replace(/\/$/,'')+'/v1/inpaint';
     const response=await fetch(endpoint,{method:'POST',body:form});
     if(!response.ok)throw new Error('HTTP '+response.status);
     const result=await response.blob();
     const bitmap=await createImageBitmap(result);
     const patch=document.createElement('canvas');patch.width=Math.max(1,Math.ceil(cover.width));patch.height=Math.max(1,Math.ceil(cover.height));
     patch.getContext('2d')!.drawImage(bitmap,(cover.left||0)*sx,(cover.top||0)*sy,cover.width*sx,cover.height*sy,0,0,patch.width,patch.height);
     bitmap.close();
     c.add(new FabricImage(patch,{left:cover.left,top:cover.top,selectable:false,evented:false}));
     setMessage('Background restored. Edit the selected text with the cursor.');
   }catch(error){
     console.warn('Image service unavailable; using local fallback:',error);
     c.add(cover);
     setMessage('Image service unavailable; using local background fill.');
   }
 }else c.add(cover);
 const candidateFonts=['Arial','Helvetica','Verdana','Tahoma','Georgia','Times New Roman','Impact'];
 const measure=document.createElement('canvas').getContext('2d')!;
 const fontSize=Math.max(9,d.height*1.04);
 const best=candidateFonts.map(family=>{
  measure.font=`${appearance.weight} ${fontSize}px "${family}"`;
  const width=measure.measureText(replacementText??d.text).width;
  return {family,width,score:Math.abs(Math.log(Math.max(1,width)/Math.max(1,d.width)))};
 }).sort((a,b)=>a.score-b.score)[0];
 const t=new IText(replacementText??d.text,{left:d.left,top:d.top-Math.max(0,d.height*.08),fontFamily:best.family,fontWeight:appearance.weight,fontSize,fill:appearance.foreground,stroke:appearance.outline,strokeWidth:appearance.outline?Math.max(.8,d.height*.035):0,paintFirst:'stroke',strokeUniform:true,editable:true});
 if(t.width&&d.width>0)t.set({scaleX:d.width/t.width});
 c.add(t);c.setActiveObject(t);c.requestRenderAll();setSelected(t);setValue(t.text||'');save();return t;
 }
 function addText(d?:Detection){
 const c=editor.current;if(!c||!loaded)return;
 if(d){void createReplacement(d);return}
 const t=new IText('Your text',{left:c.width/4,top:c.height/3,fontFamily:'Arial',fontSize:36,fill:'#ffffff',editable:true});
 c.add(t);c.setActiveObject(t);c.requestRenderAll();setSelected(t);setValue(t.text||'');save();
 }
 function markText(d:Detection){
 const c=editor.current!;
 const region=new Rect({left:d.left,top:d.top,width:Math.max(8,d.width),height:Math.max(8,d.height),fill:'rgba(0,0,0,0.001)',stroke:'rgba(0,0,0,0)',strokeWidth:0,selectable:false,evented:true,hoverCursor:'text'});
 (region as Rect & {ocrText?:string;ocrDetection?:Detection}).ocrText=d.text;
 (region as Rect & {ocrText?:string;ocrDetection?:Detection}).ocrDetection=d;
 c.add(region);
 }

 async function detect(){
 const img=source.current,c=editor.current;
 if(!img||!c)return;
 setBusy(true);setMessage('Preparing OCR…');
 let worker:Awaited<ReturnType<typeof createWorker>>|undefined;
 try{
   // The original blob URL is revoked after upload. OCR must receive stable image pixels,
   // not the revoked HTMLImageElement.src.
   const pixels=document.createElement('canvas');
   pixels.width=img.naturalWidth;pixels.height=img.naturalHeight;
   const ctx=pixels.getContext('2d');
   if(!ctx)throw new Error('Canvas 2D context is unavailable');
   ctx.drawImage(img,0,0);
   const imageData=pixels.toDataURL('image/png');
   worker=await createWorker('eng',1,{
     logger:progress=>{
       if(progress.status==='recognizing text')setMessage('Recognizing text… '+Math.round(progress.progress*100)+'%');
       else if(progress.status)setMessage('OCR: '+progress.status);
     }
   });
   // Tesseract.js v5 does not include word boxes unless explicitly requested.
   const result=await worker.recognize(imageData);
   const lines=result.data.lines||[];
   const words=result.data.words||[];
   const sx=c.width/img.naturalWidth,sy=c.height/img.naturalHeight;
   // Remove prior unedited OCR hit regions without touching original pixels.
   c.getObjects().filter(o=>o instanceof Rect && !!(o as Rect & {ocrText?:string}).ocrText).forEach(o=>c.remove(o));
   let n=0;
   if(lines.length){
     for(const line of lines){
       if(!line.text.trim()||line.confidence<35)continue;
       const b=line.bbox;
       markText({text:line.text.trim(),left:b.x0*sx,top:b.y0*sy,width:(b.x1-b.x0)*sx,height:(b.y1-b.y0)*sy});
       n++;
     }
   }else{
     // Fallback: combine nearby OCR words into lines rather than separate letter objects.
     const groups:typeof words[]=[];
     for(const word of words.filter(w=>w.text.trim()&&w.confidence>=45).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){
       const center=(word.bbox.y0+word.bbox.y1)/2;
       let group=groups.find(g=>g.length&&Math.abs((g[0].bbox.y0+g[0].bbox.y1)/2-center)<Math.max(8,(word.bbox.y1-word.bbox.y0)*.5));
       if(!group){group=[];groups.push(group)}group.push(word);
     }
     for(const group of groups){
       group.sort((a,b)=>a.bbox.x0-b.bbox.x0);
       const x0=Math.min(...group.map(w=>w.bbox.x0)),y0=Math.min(...group.map(w=>w.bbox.y0));
       const x1=Math.max(...group.map(w=>w.bbox.x1)),y1=Math.max(...group.map(w=>w.bbox.y1));
       markText({text:group.map(w=>w.text).join(' '),left:x0*sx,top:y0*sy,width:(x1-x0)*sx,height:(y1-y0)*sy});n++;
     }
   }
   setMessage(n? n+' text regions detected. Click the word you want to edit; the rest of the image stays untouched.':'OCR completed, but no sufficiently clear words were found.');
 }catch(error){
   console.error('PixelType OCR failure:',error);
   setMessage('OCR failed: '+(error instanceof Error?error.message:String(error)));
 }finally{
   if(worker){try{await worker.terminate()}catch(error){console.warn('OCR cleanup:',error)}}
   setBusy(false);
 }
 }
 function cover(){if(!selected||!editor.current)return;const c=editor.current;const bounds=selected.getBoundingRect();const r=new Rect({left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height,fill:'#ffffff',selectable:true});c.add(r);c.sendObjectBackwards(r);c.requestRenderAll();save();setMessage('White cover inserted. Change its fill colour using Fabric controls in a future release.')}
 function exportImage(){const c=editor.current;if(!c)return;const a=document.createElement('a');a.download='pixeltype-edited.png';a.href=c.toDataURL({format:'png',multiplier:1});a.click()}
 function remove(){if(!selected)return;editor.current?.remove(selected);editor.current?.discardActiveObject();editor.current?.requestRenderAll();setSelected(null);save()}
 return <div className="app">
 <header><div className="brand"><span className="logo">T<span>.</span></span><div><strong>PixelType</strong><small>IMAGE TEXT STUDIO</small></div></div><div className="header-actions"><button onClick={()=>fileInput.current?.click()}><ImagePlus size={17}/> <span className="desktop-label">New image</span></button><button className="primary" onClick={exportImage} disabled={!loaded}><Download size={17}/> Export</button></div></header>
 <div className="workspace">
 <main className="stage"><div className="stagebar"><span>{loaded?'EDIT IMAGE':'CANVAS'}</span><span>{loaded?editor.current?.width+' × '+editor.current?.height+' px':'Original quality preserved'}</span></div><div className="upload-feedback" role="status" aria-live="polite">{busy?'⏳ ':loaded?'✓ ':'ⓘ '}{message}</div>
 <div className="canvas-wrap" ref={canvasWrap}>{!loaded&&<div className="empty"><div className="empty-icon"><ImagePlus size={40}/></div><h1>Edit text. Keep the look.</h1><p>Upload an image, tap detected text, then adjust the font and style using the tools below.</p><button className="primary big" onClick={()=>fileInput.current?.click()}><Upload size={19}/> Choose an image</button><p className="hint">PNG · JPG · WebP</p></div>}<div className={loaded?'canvas-visible':'canvas-hidden'}><canvas ref={element}/></div>{busy&&<div className="processing"><span className="spinner"/> {message}</div>}</div>
 <div className="status">{busy?'⏳ ':'✦ '}{message}</div></main>
 <section className="bottom-editor">
 <nav className="toolstrip"><button onClick={()=>fileInput.current?.click()}><Upload size={19}/>Image</button><button onClick={detect} disabled={!loaded||busy}><ScanText size={19}/>Detect</button><button onClick={()=>addText()} disabled={!loaded}><Type size={19}/>Add text</button><button onClick={()=>restore(indexRef.current-1)} disabled={historyIndex<=0}><Undo2 size={19}/>Undo</button><button onClick={()=>restore(indexRef.current+1)} disabled={historyIndex>=history.length-1}><Redo2 size={19}/>Redo</button><button onClick={remove} disabled={!selected}><Trash2 size={19}/>Delete</button></nav>
 <nav className="panel-tabs">{(['font','style','position','tools'] as const).map(p=><button key={p} className={panel===p?'active':''} onClick={()=>setPanel(p)}>{p==='font'?'Font':p==='style'?'Style':p==='position'?'Position':'More tools'}</button>)}</nav>
 {pendingRegion&&!selected&&<div className="editing-panel"><div className="text-editor"><textarea rows={2} aria-label="Replacement text" value={value} onChange={e=>setValue(e.target.value)}/><button className="primary" onClick={()=>{const d=pendingRegion;if(!d)return;if(value===d.text){setPendingRegion(null);setMessage('No changes made. Original image preserved.');return}setBusy(true);void createReplacement(d,value).then(()=>{editor.current?.getObjects().filter(o=>o instanceof Rect&&(o as Rect & {ocrDetection?:Detection}).ocrDetection===d).forEach(o=>editor.current?.remove(o));setPendingRegion(null);setMessage('Replacement applied. Adjust font styling below if necessary.')}).catch(e=>setMessage('Replacement failed: '+String(e))).finally(()=>setBusy(false))}}>Apply</button><button onClick={()=>{setPendingRegion(null);setMessage('Selection cancelled. Original image preserved.')}}>Cancel</button></div><p className="editor-hint">The original pixels stay unchanged until Apply. Exact styling of new letters is not guaranteed.</p></div>}
 {selected?<div className="editing-panel">
 <div className="text-editor"><textarea rows={2} aria-label="Edit selected text" value={value} onChange={e=>{setValue(e.target.value);update({text:e.target.value})}}/><button className="primary" onClick={()=>{editor.current?.discardActiveObject();editor.current?.requestRenderAll()}}>Done ✓</button></div>
 {panel==='font'&&<><div className="category-tabs">{['All','Sans','Serif','Display','Mono'].map(cat=><button key={cat} className={fontCategory===cat?'active':''} onClick={()=>setFontCategory(cat)}>{cat}</button>)}</div><div className="font-grid">{fontChoices.map(f=><button key={f} className={font===f?'chosen':''} onClick={()=>{setFont(f);update({fontFamily:f})}}><span style={{fontFamily:f}}>{f}</span><small style={{fontFamily:f}}>Aa Bb 0123456789</small></button>)}</div></>}
 {panel==='style'&&<div className="control-grid"><label>Size <input type="number" min="6" max="400" value={size} onChange={e=>{const n=Number(e.target.value);setSize(n);update({fontSize:n})}}/></label><label>Text colour <input type="color" value={color} onChange={e=>{setColor(e.target.value);update({fill:e.target.value})}}/></label><label>Outline colour <input type="color" value={strokeColor} onChange={e=>{setStrokeColor(e.target.value);update({stroke:e.target.value})}}/></label><label>Outline width {strokeSize}<input type="range" min="0" max="15" step=".5" value={strokeSize} onChange={e=>{const n=Number(e.target.value);setStrokeSize(n);update({strokeWidth:n,stroke:strokeColor})}}/></label><label>Letter spacing {spacing}<input type="range" min="-100" max="500" value={spacing} onChange={e=>{const n=Number(e.target.value);setSpacing(n);update({charSpacing:n})}}/></label><label>Opacity {opacity}%<input type="range" min="0" max="100" value={opacity} onChange={e=>{const n=Number(e.target.value);setOpacity(n);update({opacity:n/100})}}/></label><button onClick={()=>update({fontWeight:selected.fontWeight==='bold'?'normal':'bold'})}>Bold</button><button onClick={()=>update({fontStyle:selected.fontStyle==='italic'?'normal':'italic'})}>Italic</button><button onClick={()=>update({underline:!selected.underline})}>Underline</button></div>}
 {panel==='position'&&<div className="control-grid"><label>Rotation {angle}°<input type="range" min="-180" max="180" value={angle} onChange={e=>{const n=Number(e.target.value);setAngle(n);update({angle:n})}}/></label><button onClick={()=>update({textAlign:'left'})}>Align left</button><button onClick={()=>update({textAlign:'center'})}>Centre</button><button onClick={()=>update({textAlign:'right'})}>Align right</button><button onClick={()=>update({scaleX:1,scaleY:1})}>Reset scale</button></div>}
 {panel==='tools'&&<div className="control-grid"><button onClick={cover}>Cover behind text</button><button className="danger" onClick={remove}>Delete text layer</button></div>}
 </div>:<div className="editor-hint">Tap Detect, then select text in your image to edit it. Font and styling options will appear here.</div>}
 <div className="extra-tools"><label><input type="checkbox" checked={aiEnabled} onChange={e=>setAiEnabled(e.target.checked)} disabled={!import.meta.env.VITE_AI_API_URL}/> AI background restoration {import.meta.env.VITE_AI_API_URL?'':'(not connected)'}</label><button onClick={()=>setShowOriginal(!showOriginal)} disabled={!loaded}>{showOriginal?<Eye size={15}/>:<EyeOff size={15}/>} Original visible</button></div>
 </section></div>
 <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const chosen=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(chosen)}}/></div>}
