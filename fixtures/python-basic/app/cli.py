"""コマンドラインの入口。注文を作って通知するまでの流れを組み立てる。"""
import app.config as config
from app.services.orders import OrderService
from app.services.notify import notify_created


def run() -> None:
    service = OrderService(tax_rate=config.TAX_RATE)
    order = service.create("alice", [("りんご", 120), ("みかん", 80)])
    notify_created(order)
