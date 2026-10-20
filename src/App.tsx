import {useEffect,useRef,useState} from 'react';
import {Canvas,FabricImage,IText,Rect,FabricObject} from 'fabric';
import {createWorker} from 'tesseract.js';
import {Upload,ScanText,Type,Download,Undo2,Redo2,Trash2,ImagePlus,Eye,EyeOff} from 'lucide-react';
type Detection={text:string;left:number;top:number;width:number;height:number};
export default function App(){
 const element=useRef<HTMLCanvasElement>(null),editor=useRef<Canvas|null>(null),source=useRef<HTMLImageElement|null>(null),fileInput=useRef<HTMLInputElement>(null);
 const [aiEnabled,setAiEnabled]=useState(Boolean(import.meta.env.VITE_AI_API_URL));
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Upload an image to begin'),[selected,setSelected]=useState<IText|null>(null);
 const [value,setValue]=useState(''),[color,setColor]=useState('#ffffff'),[font,setFont]=useState('Arial'),[size,setSize]=useState(36),[opacity,setOpacity]=useState(100),[angle,setAngle]=useState(0),[showOriginal,setShowOriginal]=useState(true);
 const [history,setHistory]=useState<string[]>([]),[historyIndex,setHistoryIndex]=useState(-1),historyRef=useRef<string[]>([]),indexRef=useRef(-1),restoring=useRef(false);
 useEffect(()=>{if(!element.current)return;const c=new Canvas(element.current,{width:960,height:540,backgroundColor:'#202c28',preserveObjectStacking:true});editor.current=c;
 const sync=()=>{const o=c.getActiveObject();if(o instanceof IText){setSelected(o);setValue(o.text||'');setColor(typeof o.fill==='string'?o.fill:'#ffffff');setFont(o.fontFamily||'Arial');setSize(o.fontSize||36);setOpacity(Math.round((o.opacity||1)*100));setAngle(o.angle||0)}else setSelected(null)};
 c.on('selection:created',sync);c.on('selection:updated',sync);c.on('selection:cleared',sync);
 c.on('mouse:down',event=>{const target=event.target;if(target instanceof Rect && (target as Rect & {ocrText?:string}).ocrText){const region=target as Rect & {ocrText?:string;ocrDetection?:Detection};if(!region.ocrDetection)return;const detection=region.ocrDetection;c.remove(region);void createReplacement(detection).then(t=>{t.enterEditing();t.selectAll();t.hiddenTextarea?.focus();c.requestRenderAll()}).catch(error=>setMessage('Unable to prepare selected text: '+String(error)));}});
 c.on('mouse:dblclick',event=>{const target=event.target;if(target instanceof IText){c.setActiveObject(target);target.enterEditing();target.selectAll();target.hiddenTextarea?.focus();c.requestRenderAll()}});
 const changed=()=>save();c.on('object:modified',changed);c.on('text:changed',changed);c.on('object:added',changed);c.on('object:removed',changed);
 return()=>{editor.current=null;void c.dispose()}},[]);
 function save(){const c=editor.current;if(!c||restoring.current)return;const snapshot=JSON.stringify(c.toJSON());if(historyRef.current[indexRef.current]===snapshot)return;const next=[...historyRef.current.slice(0,indexRef.current+1),snapshot].slice(-35);historyRef.current=next;indexRef.current=next.length-1;setHistory(next);setHistoryIndex(indexRef.current)}
 async function restore(i:number){const c=editor.current;if(!c||i<0||i>=historyRef.current.length)return;restoring.current=true;await c.loadFromJSON(historyRef.current[i]);c.renderAll();indexRef.current=i;setHistoryIndex(i);setSelected(null);restoring.current=false}
 function update(props:Partial<IText>){if(!selected)return;selected.set(props);selected.setCoords();editor.current?.requestRenderAll();save()}
 async function upload(file?:File){if(!file||!file.type.startsWith('image/'))return;setBusy(true);try{const url=URL.createObjectURL(file);const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=url});const c=editor.current!;const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);c.clear();c.setDimensions({width:w,height:h});const background=await FabricImage.fromURL(url);background.set({left:0,top:0,scaleX:w/img.naturalWidth,scaleY:h/img.naturalHeight,selectable:false,evented:false});c.add(background);c.sendObjectToBack(background);c.renderAll();source.current=img;setLoaded(true);setShowOriginal(true);setMessage('Image loaded. Detect text or add a text layer.');URL.revokeObjectURL(url);historyRef.current=[];indexRef.current=-1;save()}catch(e){setMessage('Unable to open this image.')}finally{setBusy(false)}}
 function sampleAppearance(d:Detection){
 const img=source.current!,c=editor.current!;
 const pixels=document.createElement('canvas');pixels.width=img.naturalWidth;pixels.height=img.naturalHeight;
 const ctx=pixels.getContext('2d')!;ctx.drawImage(img,0,0);
 const sx=img.naturalWidth/c.width,sy=img.naturalHeight/c.height;
 const x=d.left*sx,y=d.top*sy,w=d.width*sx,h=d.height*sy;
 const rgb=(px:number,py:number)=>{const data=ctx.getImageData(Math.max(0,Math.min(img.naturalWidth-1,Math.round(px))),Math.max(0,Math.min(img.naturalHeight-1,Math.round(py))),1,1).data;return [data[0],data[1],data[2]]};
 const samples=[rgb(x-3,y+h*.5),rgb(x+w+3,y+h*.5),rgb(x+w*.5,y-3),rgb(x+w*.5,y+h+3)];
 const bg=[0,1,2].map(k=>Math.round(samples.reduce((n,v)=>n+v[k],0)/samples.length));
 const textPixels=[rgb(x+w*.25,y+h*.5),rgb(x+w*.5,y+h*.5),rgb(x+w*.75,y+h*.5)];
 const distance=(p:number[])=>p.reduce((sum,v,k)=>sum+Math.abs(v-bg[k]),0);
 const fg=textPixels.sort((p,q)=>distance(q)-distance(p))[0];
 const hex=(p:number[])=>'#'+p.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
 return {background:hex(bg),foreground:hex(distance(fg)>55?fg:bg.reduce((a,v)=>a+v,0)/3>127?[0,0,0]:[255,255,255])};
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
 async function createReplacement(d:Detection){
 const c=editor.current!;
 const appearance=sampleAppearance(d);
 // Only the clicked OCR region is changed. For flat-colour graphics, a
 // uniform cover avoids sampling characters from unrelated nearby artwork.
 const pad=Math.max(1,Math.min(3,d.height*.035));
 const cover=new Rect({left:Math.max(0,d.left-pad),top:Math.max(0,d.top-pad),width:d.width+pad*2,height:d.height+pad*2,fill:appearance.background,selectable:false,evented:false});
 if(aiEnabled && import.meta.env.VITE_AI_API_URL){
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
     const endpoint=String(import.meta.env.VITE_AI_API_URL).replace(/\\/$/,'')+'/v1/inpaint';
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
 const white=appearance.foreground.toLowerCase()==='#ffffff';
 const t=new IText(d.text,{left:d.left,top:d.top- Math.max(0,d.height*.06),fontFamily:'Arial',fontWeight:'bold',fontSize:Math.max(10,d.height*.99),fill:white?'#ffffff':appearance.foreground,stroke:'#111111',strokeWidth:Math.max(1,d.height*.035),paintFirst:'stroke',strokeUniform:true,editable:true});
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
 return <div className="app"><header><div className="brand"><span className="logo">T<span>.</span></span><div><strong>PixelType</strong><small>IMAGE TEXT STUDIO</small></div></div><div className="header-actions"><span className="pill">● Local-first editor</span><button onClick={()=>fileInput.current?.click()}><ImagePlus size={17}/> New image</button><button className="primary" onClick={exportImage} disabled={!loaded}><Download size={17}/> Export PNG</button></div></header>
 <div className="workspace"><aside className="tools"><button title="Upload image" onClick={()=>fileInput.current?.click()}><Upload/></button><button title="Detect text (OCR)" onClick={detect} disabled={!loaded||busy}><ScanText/></button><button title="Add text" onClick={()=>addText()} disabled={!loaded}><Type/></button><button title="Undo" onClick={()=>restore(indexRef.current-1)} disabled={historyIndex<=0}><Undo2/></button><button title="Redo" onClick={()=>restore(indexRef.current+1)} disabled={historyIndex>=history.length-1}><Redo2/></button><button title="Delete selected text" onClick={remove} disabled={!selected}><Trash2/></button></aside>
 <main className="stage"><div className="stagebar"><span>CANVAS</span><span>{loaded?editor.current?.width+' × '+editor.current?.height+' px':'No image selected'}</span></div><div className="canvas-wrap">{!loaded&&<div className="empty"><div className="empty-icon"><ImagePlus size={40}/></div><h1>Edit text. Keep the look.</h1><p>Upload a photo, screenshot, poster or graphic. Detect text and add editable layers directly over your image.</p><button className="primary big" onClick={()=>fileInput.current?.click()}><Upload size={19}/> Choose an image</button><p className="hint">PNG · JPG · WebP · All processing happens in your browser</p></div>}<div className={loaded?'canvas-visible':'canvas-hidden'}><canvas ref={element}/></div></div><div className="status">{busy?'⏳ ': '✦ '}{message}</div></main>
 <aside className="inspector"><div className="panel-title">PROPERTIES</div>{selected?<div className="fields"><label>TEXT CONTENT<textarea rows={4} value={value} onChange={e=>{setValue(e.target.value);update({text:e.target.value})}}/></label><label>FONT FAMILY<select value={font} onChange={e=>{setFont(e.target.value);update({fontFamily:e.target.value})}}>{['Arial','Helvetica','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS','Courier New','Impact','Comic Sans MS'].map(f=><option key={f}>{f}</option>)}</select></label><div className="split"><label>FONT SIZE<input type="number" min="6" max="300" value={size} onChange={e=>{const n=Number(e.target.value);setSize(n);update({fontSize:n})}}/></label><label>TEXT COLOUR<input type="color" value={color} onChange={e=>{setColor(e.target.value);update({fill:e.target.value})}}/></label></div><label>OPACITY — {opacity}%<input type="range" min="0" max="100" value={opacity} onChange={e=>{const n=Number(e.target.value);setOpacity(n);update({opacity:n/100})}}/></label><label>ROTATION — {angle}°<input type="range" min="-180" max="180" value={angle} onChange={e=>{const n=Number(e.target.value);setAngle(n);update({angle:n})}}/></label><button onClick={cover}>Add white cover behind text</button><button className="danger" onClick={remove}><Trash2 size={16}/> Delete layer</button></div>:<div className="no-selection"><Type size={28}/><h3>No text selected</h3><p>Select a text layer on the canvas to edit its appearance.</p></div>}<div className="panel-title lower">QUICK ACTIONS</div><div className="quick"><label style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}><input type="checkbox" checked={aiEnabled} onChange={e=>setAiEnabled(e.target.checked)} disabled={!import.meta.env.VITE_AI_API_URL}/> Use image-restoration service {import.meta.env.VITE_AI_API_URL?'':'(not configured)'}</label><button onClick={detect} disabled={!loaded||busy}><ScanText size={17}/> Detect text with OCR</button><button onClick={()=>addText()} disabled={!loaded}><Type size={17}/> Add text layer</button><button onClick={()=>setShowOriginal(!showOriginal)} disabled={!loaded}>{showOriginal?<Eye size={17}/>:<EyeOff size={17}/>} Original image: {showOriginal?'visible':'hidden'}</button></div><p className="disclaimer">Detection leaves the original image unchanged. Click a detected text region to replace just that region. Exact fonts and complex backgrounds still require advanced restoration.</p></aside></div>
 <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></div>}
