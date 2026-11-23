"""Profile-only Excel update. Preview first, then --apply --plan matching-report.json.

Blank cells preserve existing values. Identity and activity collections are immutable.
Only the supported profile sheet is processed; nonempty activity sheets abort.
"""
import argparse, copy, datetime, hashlib, importlib.util, json, re, shutil, unicodedata
from pathlib import Path
from urllib.parse import urlsplit

def digest(data):
    return hashlib.sha256(data).hexdigest()

def https(value):
    u = urlsplit(value)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or re.search(r'\s', value):
        raise ValueError('Invalid HTTPS URL: ' + value)
    return value

def birthday(value):
    statuses = {'秘密':'secret', '非公開':'private', '毎日':'everyday', '不明':'unknown'}
    if value in statuses:
        return None, statuses[value]
    s = unicodedata.normalize('NFKC', value)
    if s.isdigit():
        month, day = divmod(int(s), 100)
    else:
        match = re.fullmatch(r'(\d{1,2})[-/月](\d{1,2})日?', s)
        if not match: raise ValueError('Invalid birthday: ' + s)
        month, day = map(int, match.groups())
    datetime.date(2000, month, day)
    return f'{month:02}-{day:02}', None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('extractor', Path(__file__).with_name('excel-to-json.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    sheets = module.extract(args.workbook)
    for name in ['衣装・ビジュアル', '衣装差分', '楽曲', '活動履歴']:
        if len(sheets[name]) > 1: raise ValueError('Profile-only importer: nonempty sheet ' + name)
    rows = sheets['代表画像・プロフィール']; header = rows[0]
    required = ['ライバー名（変更しない）','公式プロフィールURL（変更しない）','代表立ち絵URL（入力）','画像の出典URL','代表顔アイコンURL（入力）','画像の出典URL2','所属','誕生日（MM-DD）','デビュー日（YYYY-MM-DD）','身長（例：160cm）','ファンマーク','ファンネーム','紹介文','備考・修正指示','各種リンク（youtube）','各種リンク（Twitch）','各種リンク（Twitter）','各種リンク（ファンクラブ）','各種リンク（公式ストア）','各種リンク（エニマガ）']
    wiki = [h for h in header if 'wiki' in str(h).lower() or 'Wiki' in str(h) or 'ウィキ' in str(h)]
    if len(set(header)) != len(header) or set(header) != set(required + wiki) or len(wiki) > 1:
        raise ValueError('Unexpected or duplicate workbook columns')
    records = {}
    for p in sorted(Path('public/data/livers').glob('*.json')):
        if p.name.startswith('demo_'): continue
        raw = p.read_bytes(); data = json.loads(raw)
        key = data['officialProfileUrl']
        if key in records: raise ValueError('Duplicate profile URL')
        records[key] = (p, raw, data)
    if len(rows)-1 != len(records): raise ValueError('Workbook must cover the complete roster')
    seen = set(); staged = []; changes = []; held = []
    for row in rows[1:]:
        f = {h: str(row[i]).strip() if i < len(row) and row[i] is not None else '' for i,h in enumerate(header)}
        key = f[required[1]]
        if key in seen or key not in records: raise ValueError('Duplicate or unmatched profile URL: '+key)
        seen.add(key); p, raw, original = records[key]; data = copy.deepcopy(original)
        if unicodedata.normalize('NFKC', f[required[0]]) != unicodedata.normalize('NFKC', data['name']): raise ValueError('Name mismatch: '+key)
        def field(name, value, visibility=None):
            old = data.get(name, {})
            if old.get('value') == value and old.get('visibility') == visibility: return
            data[name] = {**old, 'value':value, 'verification':'legacy-unreviewed', 'sources':[{'label':'手動入力Excel（公式ページ未再照合）','url':key}], 'showSources':True}
            data[name].pop('visibility', None)
            if visibility: data[name]['visibility'] = visibility
        for col, target in [(2,'portraitUrl'),(3,'portraitSourceUrl'),(4,'faceIconUrl'),(5,'faceIconSourceUrl'),(14,'youtubeChannelUrl'),(16,'xUrl')]:
            if f[required[col]]: data[target] = https(f[required[col]])
        if data.get('youtubeChannelId') and '/channel/' in data.get('youtubeChannelUrl','') and data['youtubeChannelUrl'].rstrip('/').split('/')[-1] != data['youtubeChannelId']:
            raise ValueError('YouTube channel identity mismatch: '+data['name'])
        branch = f['所属']
        if branch:
            if branch not in ['JP','EN','KR','ID']: raise ValueError('Unknown affiliation')
            data['profileBranch'] = branch
            if branch != original['branch']: held.append({'name':data['name'],'field':'branch','existing':original['branch'],'excel':branch,'action':'preserve branch; store profileBranch'})
        if f[required[7]]:
            value, visibility = birthday(f[required[7]])
            if visibility == 'unknown' and data['birthday'].get('value'): held.append({'name':data['name'],'field':'birthday','action':'preserve known birthday'})
            else: field('birthday', value, visibility)
        if f[required[8]]:
            s = f[required[8]]
            if re.fullmatch(r'\d{8}',s): s = f'{s[:4]}-{s[4:6]}-{s[6:]}'
            datetime.date.fromisoformat(s); field('debutDate',s)
        for col, target in [(9,'height'),(10,'fanMark'),(12,'introduction')]:
            if f[required[col]]: field(target,f[required[col]])
        if f['ファンネーム']:
            groups = data['fields']; group = next((g for g in groups if g['section']=='追加プロフィール'),None)
            if group is None: group = {'section':'追加プロフィール','items':[]}; groups.append(group)
            item = next((i for i in group['items'] if i['label']=='ファンネーム'),None)
            if item is None: item = {'label':'ファンネーム','data':{}}; group['items'].append(item)
            if item['data'].get('value') != f['ファンネーム']: item['data'] = {**item['data'],'value':f['ファンネーム'],'verification':'legacy-unreviewed','sources':[{'label':'手動入力Excel','url':key}],'showSources':True}
        links = data.setdefault('profileLinks',{})
        for col, target in [(14,'youtube'),(15,'twitch'),(16,'x'),(17,'fanclub'),(18,'store'),(19,'magazine')]:
            if f[required[col]]: links[target] = https(f[required[col]])
        if wiki and f[wiki[0]]: links['wiki'] = https(f[wiki[0]])
        if f['備考・修正指示']: held.append({'name':data['name'],'note':f['備考・修正指示']})
        allowed = {'portraitUrl','portraitSourceUrl','faceIconUrl','faceIconSourceUrl','youtubeChannelUrl','xUrl','profileBranch','birthday','debutDate','height','fanMark','introduction','fields','profileLinks'}
        for k in sorted(original.keys() | data.keys()):
            if original.get(k) != data.get(k):
                if k not in allowed: raise ValueError('Protected field modified: '+k)
                changes.append({'id':data['id'],'name':data['name'],'field':k,'before':original.get(k),'after':data.get(k)})
        if data != original: staged.append((p,raw,data))
    report = {'sourceSha256':digest(args.workbook.read_bytes()),'baseline':{str(p):digest(raw) for p,raw,_ in records.values()},'matched':len(seen),'changedPeople':len(staged),'changes':changes,'held':held}
    if args.apply:
        if not args.plan or json.loads(args.plan.read_text(encoding='utf-8')) != report: raise ValueError('Plan differs: run a new dry-run before applying')
        backup = Path('.profile-backups') / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup.mkdir(parents=True)
        for p,raw,_ in records.values(): (backup/p.name).write_bytes(raw)
        (backup/'plan.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        try:
            for p,raw,data in staged:
                if p.read_bytes()!=raw: raise ValueError('Data changed during apply')
                tmp = p.with_suffix('.tmp'); tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); tmp.replace(p)
        except Exception:
            for p,raw,_ in staged: p.write_bytes(raw)
            raise
        print('Backup:', backup)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'matched':len(seen),'changedPeople':len(staged),'fieldChanges':len(changes),'held':len(held),'applied':args.apply}))

if __name__ == '__main__': main()
