using MyApp.Models;

namespace MyApp.Services;

/// <summary>注文を作る。Customer は using しているが使っていない（線を出さない）。</summary>
public class OrderService
{
    public Order Create() => new Order();
}
