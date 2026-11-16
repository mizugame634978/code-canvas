# fixtures/csharp-wpf

C# / WPF の参照解決を確かめるためのサンプル（ビルドはしない。解析専用）。
期待する線は `webview/src/__tests__/fixtures-csharp.test.ts` で固定している。ファイルを変えたらテストも合わせる。

```bash
node tools/edges.mjs fixtures/csharp-wpf --isolated       # 線の一覧（リポジトリのルートで）
```

## C# の線の引き方
C# は `using` で**名前空間**を取り込むので、`using` の行だけでは「どのファイルを使っているか」が分からない。
そこで、各ファイルが宣言している型（class / struct / interface / enum / record）の一覧を作り、
ファイルの中に出てくる型の名前を C# と同じ順で探して線にする（`extension/src/csResolve.ts`）。

1. 自分の名前空間 → その外側の名前空間（`MyApp.ViewModels` → `MyApp` → 名前空間なし）
2. そのファイルの `using` と、プロジェクト全体の `global using`
3. `MyApp.Services.SettingsStore` のような名前空間付きの書き方、`using M = ...;` の別名

コメント・文字列・`using` の行・型の宣言そのもの（`class Order`）は数えない。
字面だけで判断するので、型と同じ名前のプロパティやローカル変数があると、型への線として数えることがある。

## 含めている書き方

| ファイル | 書き方 | 確かめたいこと |
|---|---|---|
| `ViewModels/MainViewModel.cs` | `: ViewModelBase` | **同じ名前空間**の型（`using` 不要） |
| `ViewModels/MainViewModel.cs` | `Order?`（`using` なし） | **`global using`**（`GlobalUsings.cs`） |
| `ViewModels/MainViewModel.cs` | `"Customer の一覧"` | 文字列の中の型名は数えない |
| `ViewModels/SettingsViewModel.cs` | `MyApp.Services.SettingsStore` | 名前空間付きの型名 |
| `Views/MainWindow.xaml.cs` | `// SettingsViewModel は…` | コメントの中の型名は数えない |
| `Models/Order.cs` + `Order.Validation.cs` | `partial class Order` | partial は宣言している全ファイルに線を出す |
| `Services/OrderService.cs` | `using MyApp.Models;` で `Customer` は使わない | **使っていない型には線を出さない** |
| `obj/…/MainWindow.g.cs`、`bin/Debug/…/Leftover.cs` | ビルド生成物の代わり | **`obj/` と `bin/Debug|Release/` は解析しない** |
| `*.xaml` | XAML | 今は解析の対象外（今後対応する） |
