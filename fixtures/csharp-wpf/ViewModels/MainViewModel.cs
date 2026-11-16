using MyApp.Services;

namespace MyApp.ViewModels;

/// <summary>メイン画面の ViewModel。同じ名前空間の基底クラスと、global using の型を使う。</summary>
public class MainViewModel : ViewModelBase
{
    private readonly OrderService _orders = new();

    public string Title { get; } = "Customer の一覧"; // 文字列内のクラス名は線を出さない

    public Order? Current { get; private set; }

    public void Load() => Current = _orders.Create();
}
