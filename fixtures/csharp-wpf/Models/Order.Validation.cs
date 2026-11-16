namespace MyApp.Models;

/// <summary>注文の検証（Order の続き）。</summary>
public partial class Order
{
    public bool IsValid => Lines.Count > 0;
}
