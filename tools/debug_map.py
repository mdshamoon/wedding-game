import json, os, sys
from PIL import Image, ImageDraw
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D=os.path.join(ROOT,'public','data')
meta=json.load(open(f'{D}/meta.json')); roads=json.load(open(f'{D}/roads.json')); routes=json.load(open(f'{D}/routes.json')); bl=json.load(open(f'{D}/buildings.json'))
x0,z0,x1,z1=meta['bounds']
# crop region arg: cx cz half
cx,cz,half=[float(a) for a in sys.argv[1:4]] if len(sys.argv)>3 else ((x0+x1)/2,(z0+z1)/2,max(x1-x0,z1-z0)/2)
S=1400/(2*half)
img=Image.open(os.path.join(ROOT,'data','debug','built_density.png')).convert('RGB')
bm=meta['builtMap']; mpp=bm['mpp']/4
# crop density bg
L=(cx-half-bm['ox'])/mpp; T=(cz-half-bm['oz'])/mpp
bg=img.crop((int(L),int(T),int(L+2*half/mpp),int(T+2*half/mpp))).resize((1400,1400))
bg=Image.blend(bg,Image.new('RGB',bg.size,(20,40,20)),0.5)
d=ImageDraw.Draw(bg)
P=lambda x,z:((x-cx+half)*S,(z-cz+half)*S)
for r in roads:
    p=r['p']; pts=[P(p[i],p[i+1]) for i in range(0,len(p),2)]
    d.line(pts,fill=(230,230,230) if r['t'] in('trunk','primary','secondary','tertiary') else (140,140,140),width=max(1,int(r['w']*S)))
import math
for b in bl:
    x,z,w,dd,a=b[:5]; ca,sa=math.cos(a),math.sin(a)
    c=[(x+sx*w/2*ca-sz*dd/2*sa, z+sx*w/2*sa+sz*dd/2*ca) for sx,sz in((-1,-1),(1,-1),(1,1),(-1,1))]
    d.polygon([P(*q) for q in c],fill=(255,150,60) if b[7] else (200,120,90))
cols={'arrival':(80,160,255),'baraat':(255,60,120),'reception':(255,220,0)}
for k,r in routes.items(): d.line([P(*q) for q in r['pts']],fill=cols[k],width=4)
for k,(x,z) in list(meta['places'].items())+[(k2,v) for k2,v in routes['arrival'].get('marks',{}).items()]:
    X,Z=P(x,z); d.ellipse((X-8,Z-8,X+8,Z+8),outline=(255,255,255),width=3); d.text((X+10,Z-6),k,fill=(255,255,255))
out=sys.argv[4] if len(sys.argv)>4 else os.path.join(ROOT,'data','debug','map.png')
bg.save(out); print(out)
