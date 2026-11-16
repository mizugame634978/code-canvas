"""OrderService のテスト。"""
from app.services.orders import OrderService


def test_total_includes_tax():
    order = OrderService(tax_rate=0.1).create("bob", [("x", 100)])
    assert order.total == 110
