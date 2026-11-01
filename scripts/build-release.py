"""Package only audited runtime files. No source trees, project data, or credentials."""
from pathlib import Path
import gzip,hashlib,io,json,shutil,tarfile,zipfile
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'package.json').read_text())
version=manifest['version']; dest=ROOT/'dist'; stage=dest/'package'
if stage.exists(): shutil.rmtree(stage)
stage.mkdir(parents=True)
files='''cordis.patch.yml index.js client.js graph-agent.mjs graph-agent-files.mjs graph-library.mjs selection-request.mjs graph-store.mjs source-bindings.mjs hierarchy-layout.mjs routing-plan.mjs visual-encoding.mjs equipment-footprints.mjs device-variants.mjs AGENT_GUIDE.md THIRD_PARTY_LICENSES.txt README.md LICENSE'''.split()
for name in files:shutil.copyfile(ROOT/name,stage/name)
for key in ['scripts','dependencies','devDependencies']:manifest.pop(key,None)
manifest['files']=sorted(files)
(stage/'package.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Stable bytes and neutral metadata make independently rebuilt archives comparable.
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w',format=tarfile.USTAR_FORMAT) as tf:
 for p in sorted(stage.iterdir()):
  entry=tf.gettarinfo(str(p),arcname='package/'+p.name)
  entry.uid=entry.gid=entry.mtime=0;entry.uname=entry.gname='';entry.mode=0o644
  with p.open('rb') as stream:tf.addfile(entry,stream)
archive=dest/f'seethrough-{version}.tgz'
archive.write_bytes(gzip.compress(buffer.getvalue(),mtime=0))
zip_path=dest/f'seethrough-{version}.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
 for name,content in [(archive.name,archive.read_bytes()),('README.md',(ROOT/'README.md').read_bytes()),('LICENSE',(ROOT/'LICENSE').read_bytes())]:
  entry=zipfile.ZipInfo(f'seethrough-{version}/{name}',(2026,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o644<<16;z.writestr(entry,content)
(dest/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in [archive,zip_path]))
print(json.dumps({'version':version,'files':len(files)+1,'archive':archive.name,'bytes':archive.stat().st_size,'zip':zip_path.name},indent=2))
