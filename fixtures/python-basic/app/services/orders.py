"""注文を作るサービス。親パッケージへの相対 import と、from でサブモジュールを取る書き方を使う。"""
from ..models import Order, User
from app.utils import formatting


class OrderService:
    def __init__(self, tax_rate: float) -> None:
        self.tax_rate = tax_rate

    def create(self, user_name: str, items: list[tuple[str, int]]) -> Order:
        subtotal = sum(price for _, price in items)
        total = round(subtotal * (1 + self.tax_rate))
        order = Order(User(user_name), items, total)
        print("小計:", formatting.money(subtotal))
        return order
