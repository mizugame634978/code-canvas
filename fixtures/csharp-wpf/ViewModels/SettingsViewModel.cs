namespace MyApp.ViewModels;

/// <summary>設定画面の ViewModel。名前空間を省略せずに型を書く。</summary>
public class SettingsViewModel : ViewModelBase
{
    private readonly MyApp.Services.SettingsStore _store = new();
}
