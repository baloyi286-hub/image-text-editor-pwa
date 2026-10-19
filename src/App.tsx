import {useEffect,useRef,useState} from 'react';
import {Canvas,FabricImage,IText,Rect,FabricObject} from 'fabric';
import {createWorker} from 'tesseract.js';
import {Upload,ScanText,Type,Download,Undo2,Redo2,Trash2,ImagePlus,Eye,EyeOff} from 'lucide-react';
type Detection={text:string;left:number;top:number;width:number;height:number};
export default function App(){
 const element=useRef<HTMLCanvasElement>(null),editor=useRef<Canvas|null>(null),source=useRef<HTMLImageElement|null>(null),fileInput=useRef<HTMLInputElement>(null);
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Upload an image to begin'),[selected,setSelected]=useState<IText|null>(null);
 const [value,setValue]=useState(''),[color,setColor]=useState('#ffffff'),[font,setFont]=useState('Arial'),[size,setSize]=useState(36),[opacity,setOpacity]=useState(100),[angle,setAngle]=useState(0),[showOriginal,setShowOriginal]=useState(true);
 const [history,setHistory]=useState<string[]>([]),[historyIndex,setHistoryIndex]=useState(-1),historyRef=useRef<string[]>([]),indexRef=useRef(-1),restoring=useRef(false);
 useEffect(()=>{if(!element.current)return;const c=new Canvas(element.current,{width:960,height:540,backgroundColor:'#202c28',preserveObjectStacking:true});editor.current=c;
 const sync=()=>{const o=c.getActiveObject();if(o instanceof IText){setSelected(o);setValue(o.text||'');setColor(typeof o.fill==='string'?o.fill:'#ffffff');setFont(o.fontFamily||'Arial');setSize(o.fontSize||36);setOpacity(Math.round((o.opacity||1)*100));setAngle(o.angle||0)}else setSelected(null)};
 c.on('selection:created',sync);c.on('selection:updated',sync);c.on('selection:cleared',sync);
 const changed=()=>save();c.on('object:modified',changed);c.on('text:changed',changed);c.on('object:added',changed);c.on('object:removed',changed);
 return()=>{editor.current=null;void c.dispose()}},[]);
 function save(){const c=editor.current;if(!c||restoring.current)return;const snapshot=JSON.stringify(c.toJSON());if(historyRef.current[indexRef.current]===snapshot)return;const next=[...historyRef.current.slice(0,indexRef.current+1),snapshot].slice(-35);historyRef.current=next;indexRef.current=next.length-1;setHistory(next);setHistoryIndex(indexRef.current)}
 async function restore(i:number){const c=editor.current;if(!c||i<0||i>=historyRef.current.length)return;restoring.current=true;await c.loadFromJSON(historyRef.current[i]);c.renderAll();indexRef.current=i;setHistoryIndex(i);setSelected(null);restoring.current=false}
 function update(props:Partial<IText>){if(!selected)return;selected.set(props);selected.setCoords();editor.current?.requestRenderAll();save()}
 async function upload(file?:File){if(!file||!file.type.startsWith('image/'))return;setBusy(true);try{const url=URL.createObjectURL(file);const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=url});const c=editor.current!;const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);c.clear();c.setDimensions({width:w,height:h});const background=await FabricImage.fromURL(url);background.set({left:0,top:0,scaleX:w/img.naturalWidth,scaleY:h/img.naturalHeight,selectable:false,evented:false});c.add(background);c.sendObjectToBack(background);c.renderAll();source.current=img;setLoaded(true);setShowOriginal(true);setMessage('Image loaded. Detect text or add a text layer.');URL.revokeObjectURL(url);historyRef.current=[];indexRef.current=-1;save()}catch(e){setMessage('Unable to open this image.')}finally{setBusy(false)}}
 function addText(d?:Detection){const c=editor.current;if(!c||!loaded)return;const t=new IText(d?.text||'Your text',{left:d?.left??c.width/4,top:d?.top??c.height/3,fontFamily:'Arial',fontSize:d?Math.max(12,Math.min(120,d.height*.85)):36,fill:'#ffffff',strokeWidth:0});c.add(t);c.setActiveObject(t);c.renderAll();setSelected(t);setValue(t.text||'');save()}
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
   const result=await worker.recognize(imageData,{}, {text:true,words:true});
   const words=result.data.words||[];
   const sx=c.width/img.naturalWidth,sy=c.height/img.naturalHeight;
   let n=0;
   for(const word of words){
     const b=word.bbox;
     if(!word.text.trim()||word.confidence<45)continue;
     addText({text:word.text,left:b.x0*sx,top:b.y0*sy,width:(b.x1-b.x0)*sx,height:(b.y1-b.y0)*sy});
     n++;
   }
   setMessage(n? n+' editable OCR text layers created. Original image pixels remain underneath.':'OCR completed, but no sufficiently clear words were found.');
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
 <aside className="inspector"><div className="panel-title">PROPERTIES</div>{selected?<div className="fields"><label>TEXT CONTENT<textarea rows={4} value={value} onChange={e=>{setValue(e.target.value);update({text:e.target.value})}}/></label><label>FONT FAMILY<select value={font} onChange={e=>{setFont(e.target.value);update({fontFamily:e.target.value})}}>{['Arial','Helvetica','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS','Courier New','Impact','Comic Sans MS'].map(f=><option key={f}>{f}</option>)}</select></label><div className="split"><label>FONT SIZE<input type="number" min="6" max="300" value={size} onChange={e=>{const n=Number(e.target.value);setSize(n);update({fontSize:n})}}/></label><label>TEXT COLOUR<input type="color" value={color} onChange={e=>{setColor(e.target.value);update({fill:e.target.value})}}/></label></div><label>OPACITY — {opacity}%<input type="range" min="0" max="100" value={opacity} onChange={e=>{const n=Number(e.target.value);setOpacity(n);update({opacity:n/100})}}/></label><label>ROTATION — {angle}°<input type="range" min="-180" max="180" value={angle} onChange={e=>{const n=Number(e.target.value);setAngle(n);update({angle:n})}}/></label><button onClick={cover}>Add white cover behind text</button><button className="danger" onClick={remove}><Trash2 size={16}/> Delete layer</button></div>:<div className="no-selection"><Type size={28}/><h3>No text selected</h3><p>Select a text layer on the canvas to edit its appearance.</p></div>}<div className="panel-title lower">QUICK ACTIONS</div><div className="quick"><button onClick={detect} disabled={!loaded||busy}><ScanText size={17}/> Detect text with OCR</button><button onClick={()=>addText()} disabled={!loaded}><Type size={17}/> Add text layer</button><button onClick={()=>setShowOriginal(!showOriginal)} disabled={!loaded}>{showOriginal?<Eye size={17}/>:<EyeOff size={17}/>} Original image: {showOriginal?'visible':'hidden'}</button></div><p className="disclaimer">OCR creates editable overlays, not true editable pixels. Exact font matching and seamless inpainting are not included in this initial release.</p></aside></div>
 <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></div>}
