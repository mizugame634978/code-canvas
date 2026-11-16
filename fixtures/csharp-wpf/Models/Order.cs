namespace MyApp.Models;

/// <summary>注文。partial で Order.Validation.cs と分けて書いている。</summary>
public partial class Order
{
    public Customer? Buyer { get; set; }

    public List<string> Lines { get; } = new();
}
