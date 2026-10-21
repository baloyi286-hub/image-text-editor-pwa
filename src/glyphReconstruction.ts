/**
 * Stage 1: local glyph reuse. Segments dark glyphs in a light, near-flat
 * background. Only reuses shapes when the segmentation matches source text.
 * Otherwise returns null, allowing the editable font fallback.
 */
export function reconstructGlyphs(image:HTMLImageElement, region:{text:string;left:number;top:number;width:number;height:number}, replacement:string, scaleX:number, scaleY:number):HTMLCanvasElement|null {
 const original=region.text.trim();
 if(!original||!replacement||!region.width||!region.height)return null;
 const sx=Math.max(0,Math.floor(region.left*scaleX)),sy=Math.max(0,Math.floor(region.top*scaleY));
 const sw=Math.min(image.naturalWidth-sx,Math.ceil(region.width*scaleX));
 const sh=Math.min(image.naturalHeight-sy,Math.ceil(region.height*scaleY));
 if(sw<8||sh<5||sw*sh>1600000)return null;
 const sample=document.createElement('canvas');sample.width=sw;sample.height=sh;
 const ctx=sample.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
 ctx.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
 const pixels=ctx.getImageData(0,0,sw,sh).data;
 const luminance=(x:number,y:number)=>{const i=(y*sw+x)*4;return .2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]};
 const corners=[luminance(0,0),luminance(sw-1,0),luminance(0,sh-1),luminance(sw-1,sh-1)];
 const bg=corners.reduce((a,b)=>a+b,0)/4;
 if(bg<170||Math.max(...corners)-Math.min(...corners)>32)return null;
 const threshold=Math.min(175,bg-65);
 const columns:number[]=[];
 for(let x=0;x<sw;x++){let count=0;for(let y=0;y<sh;y++)if(luminance(x,y)<threshold)count++;columns.push(count)}
 const runs:{x:number;w:number}[]=[];
 for(let x=0;x<sw;){if(columns[x]===0){x++;continue}const begin=x;while(x<sw&&columns[x]>0)x++;runs.push({x:begin,w:x-begin})}
 const chars=[...original].filter(c=>!(/\s/.test(c)));
 // Segmentation cannot safely distinguish touching glyphs or broken strokes.
 if(runs.length!==chars.length||chars.length<2)return null;
 // Very narrow/fragmented runs are usually punctuation, disconnected strokes
 // or antialiasing noise, not independently reusable complete glyphs.
 if(runs.some(r=>r.w<2))return null;
 const dictionary=new Map<string,{x:number;w:number}[]>();
 chars.forEach((letter,i)=>{const list=dictionary.get(letter)||[];list.push(runs[i]);dictionary.set(letter,list)});
 const requested=[...replacement];
 if(requested.filter(c=>!(/\s/.test(c))).some(c=>!dictionary.has(c)))return null;
 const gaps=runs.slice(1).map((r,i)=>r.x-runs[i].x-runs[i].w).filter(v=>v>0);
 const gap=gaps.length?Math.max(1,Math.round(gaps.sort((a,b)=>a-b)[Math.floor(gaps.length/2)])):Math.max(1,Math.round(sh*.12));
 const space=Math.max(gap*2,Math.round(sh*.28));
 const width=requested.reduce((sum,c)=>sum+(/\s/.test(c)?space:(dictionary.get(c)?.[0].w||0)+gap),0)+gap*2;
 if(width>4096)return null;
 const output=document.createElement('canvas');output.width=Math.max(1,width);output.height=sh;
 const out=output.getContext('2d');if(!out)return null;
 let cursor=gap;
 for(const char of requested){
  if(/\s/.test(char)){cursor+=space;continue}
  const glyph=dictionary.get(char)![0];
  // Copy full vertical source stripe: retains the original antialiasing.
  out.drawImage(sample,glyph.x,0,glyph.w,sh,cursor,0,glyph.w,sh);
  cursor+=glyph.w+gap;
 }
 // White background must be made transparent without erasing antialiasing.
 const data=out.getImageData(0,0,output.width,output.height);
 for(let i=0;i<data.data.length;i+=4){
  if(data.data[i+3]===0)continue;
  const l=.2126*data.data[i]+.7152*data.data[i+1]+.0722*data.data[i+2];
  const alpha=Math.max(0,Math.min(255,Math.round((bg-l)/(bg-threshold)*255)));
  // Pixels from the white background must not retain white RGB: that
  // produces the pale embossed/outlined effect when composited on white.
  // Convert source darkness into opacity of solid black ink.
  data.data[i]=0;data.data[i+1]=0;data.data[i+2]=0;
  data.data[i+3]=alpha;
 }
 out.putImageData(data,0,0);
 return output;
}
