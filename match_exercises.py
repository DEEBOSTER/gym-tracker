import urllib.request
import json

url = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=15) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print('Total exercises in dataset:', len(data))

# Save local copy for fast lookups
with open('static/dataset_exercises.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

ex_by_id = {ex['id']: ex for ex in data}

with open('static/exercise_guides.json', 'r', encoding='utf-8') as f:
    guides = json.load(f)

for name, g in guides.items():
    rv = g.get('remote_video', '')
    file_id = rv.split('/')[-1].split('-')[0]
    matched = ex_by_id.get(file_id)
    dataset_name = matched.get('name') if matched else 'NOT FOUND'
    print(name + ' -> ID: ' + file_id + ' -> DATASET: ' + str(dataset_name))
