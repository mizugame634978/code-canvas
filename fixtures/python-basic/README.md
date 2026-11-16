# fixtures/python-basic

Python の import 解決を確かめるためのサンプル（小さな注文管理アプリ）。
期待する線は `webview/src/__tests__/fixtures-python.test.ts` で固定している。ファイルを変えたらテストも合わせる。

```bash
python main.py            # アプリとして実際に動く
python -m scripts.seed    # ルートから -m で実行する
npm run snapshot -- fixtures/python-basic --reveal all   # キャンバスの見た目を撮る（リポジトリのルートで）
```

## 含めている import の書き方

| ファイル | 書き方 | 確かめたいこと |
|---|---|---|
| `main.py` | `from app.cli import run` | 基本形 |
| `app/cli.py` | `import app.config as config` | `as` 付きのモジュール import |
| `app/models/__init__.py` | `from .user import User` | 相対 import |
| `app/models/order.py` | `from .user import User` | 同じパッケージ内の相対 import |
| `app/services/orders.py` | `from ..models import Order, User` | 親パッケージへの相対 import。`Order` は `order.py` と大文字・小文字だけ違う |
| `app/services/orders.py` | `from app.utils import formatting` | from でサブモジュールを取る |
| `app/services/notify.py` | `from app.utils.formatting import (` … `)` | 括弧で複数行 |
| `app/services/notify.py` | 関数の中の `from app.services.orders import ...` | インデントされた import |
| `scripts/seed.py` | `import sys, app.models.user` | カンマ区切り |
| `app/utils/formatting.py` | `import datetime` | 標準ライブラリ（線を出さない） |
| `app/utils/legacy.py` | （どこからも import されない） | 孤立ノード |
