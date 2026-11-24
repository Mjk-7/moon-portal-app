"""Draws the Feedback Cat (public/feedback): our own 24x24 pixel cat whose tail
ends in a commit node. Run: python3 scripts/feedback-cat.py public/feedback
"""
import sys
from PIL import Image
# 24x24 pixel cat: big head caricature, small body, tail forking like a git branch.
PAL = {
 '.': None,
 'K': '#2a1a12',  # outline
 'O': '#f29a38',  # fur
 'D': '#d9771f',  # fur shade / stripes
 'L': '#ffe2b0',  # muzzle, belly
 'P': '#ff8fa3',  # nose, ears
 'E': '#16130f',  # eyes
 'W': '#ffffff',  # eye shine
 'G': '#34c26a',  # branch line
 'N': '#1e7f45',  # branch node rim
 'C': '#bff3cf',  # node centre
 'B': '#5b8cff',  # thinking bubble
 'Y': '#fff3c4',
}
base = [
"........................",
"..KK..........KK........",
".KOOK........KOOK.......",
".KOPOK......KOPOK.......",
".KOPPOKKKKKKOPPOK.......",
".KOOODOOOOOODOOOK.......",
"KOOOOODOOOODOOOOOK......",
"KOOOOOOOOOOOOOOOOK......",
"KOOEEOOOOOOOOEEOOK......",
"KOEWEEOOOOOOEWEEOK......",
"KOEEEEOOOOOOEEEEOK......",
"KOOEEOOOPPOOOEEOOK......",
"KOOOOOLLLLLLOOOOOK......",
"KOOOOLLKLLKLLOOOOK......",
".KOOOLLLKKLLLOOOK..NN...",
"..KKOOLLLLLLOOKK..NCCN..",
"....KOOLLLLOOK....NCCN..",
"...KOOOLLLLOOOK....NN...",
"...KOOLLLLLLOOK....D....",
"...KOOLLLLLLOOK....D....",
"...KOOOLLLLOOOKDDDDD....",
"...KOKOOOOOOKOK.........",
"....KKKKKKKKKK..........",
"........................",
]
def mood(name):
    g=[list('..'+r[:-2]) for r in base]
    if name=='think':
        # eyes look up and to the right, thought dots
        for y in (8,9,10,11):
            for x in range(3,20):
                if g[y][x] in 'EW': g[y][x]='O'
        for (y,x) in [(8,5),(8,6),(9,5),(9,6),(10,6),(8,16),(8,17),(9,16),(9,17),(10,17)]:
            g[y][x]='E'
        g[8][6]='W'; g[8][17]='W'
        # three dots bubble
        for x in (19,21,23):
            g[2][x]='B'
    if name=='done':
        for y in (8,9,10,11):
            for x in range(3,20):
                if g[y][x] in 'EW': g[y][x]='O'
        # happy closed eyes ^ ^
        for (y,x) in [(9,4),(8,5),(8,6),(9,7),(9,15),(8,16),(8,17),(9,18)]:
            g[y][x]='E'
        # check mark top right
        for (y,x) in [(4,19),(5,20),(4,21),(3,22),(2,23),(5,19),(6,20),(5,21),(4,22),(3,23)]:
            g[y][x]='G'
    return g
def check():
    for i,r in enumerate(base):
        assert len(r)==24,(i,len(r))
check()
def svg(g, bg=True):
    out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">']
    for y,row in enumerate(g):
        x=0
        while x<24:
            c=row[x]
            if PAL.get(c) is None: x+=1; continue
            w=1
            while x+w<24 and row[x+w]==c: w+=1
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="1" fill="{PAL[c]}"/>')
            x+=w
    out.append('</svg>')
    return ''.join(out)
def png(g, size, path, bg='#1f2433', pad=3):
    n=24+pad*2
    scale=size//n
    img=Image.new('RGBA',(n*scale,n*scale),bg)
    px=img.load()
    for y,row in enumerate(g):
        for x,c in enumerate(row):
            col=PAL.get(c)
            if col is None: continue
            r,gg,b=int(col[1:3],16),int(col[3:5],16),int(col[5:7],16)
            for dy in range(scale):
                for dx in range(scale):
                    px[(x+pad)*scale+dx,(y+pad)*scale+dy]=(r,gg,b,255)
    img=img.resize((size,size),Image.NEAREST)
    img.save(path)
outdir=sys.argv[1]
import os
os.makedirs(outdir,exist_ok=True)
for name in ('base','think','done'):
    g=mood(name)
    fn={'base':'cat','think':'cat-thinking','done':'cat-done'}[name]
    open(f'{outdir}/{fn}.svg','w').write(svg(g))
png(mood('base'),480,f'{outdir}/cat.png')
png(mood('think'),240,f'{outdir}/cat-thinking.png')
png(mood('done'),240,f'{outdir}/cat-done.png')
