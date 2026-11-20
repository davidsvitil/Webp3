#!/usr/bin/env python3
"""Polite page fetcher: fetch_pages.py <urls.txt> <cachedir>  (4 parallel, cached, skips existing)"""
import sys, os, hashlib, subprocess, concurrent.futures as cf, time
urls=[u.strip() for u in open(sys.argv[1]) if u.strip()]
out=sys.argv[2]; os.makedirs(out,exist_ok=True)
def get(u):
    f=os.path.join(out,hashlib.md5(u.encode()).hexdigest()+'.html')
    if os.path.exists(f) and os.path.getsize(f)>1000: return 0
    for i in range(3):
        r=subprocess.run(['curl','-sL','-m','40','-A','Mozilla/5.0 (concept-preview)','-o',f,'-w','%{http_code}',u],capture_output=True,text=True)
        if r.stdout=='200': open(f+'.url','w').write(u); return 1
        time.sleep(2*(i+1))
    if os.path.exists(f): os.remove(f)
    print('FAIL',r.stdout,u,flush=True); return 0
with cf.ThreadPoolExecutor(4) as ex:
    n=0
    for i,r in enumerate(ex.map(get,urls)):
        n+=r
        if i%200==0: print(i,len(urls),flush=True)
print('done',n)
