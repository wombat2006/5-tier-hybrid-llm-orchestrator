"""
中程度難易度のコード分析対象
仮想通貨取引シミュレーター - オブジェクト指向設計
"""
import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import json

class OrderType(Enum):
    BUY = "buy"
    SELL = "sell"

class OrderStatus(Enum):
    PENDING = "pending"
    EXECUTED = "executed"
    CANCELLED = "cancelled"

@dataclass
class MarketData:
    symbol: str
    price: float
    volume: float
    timestamp: datetime.datetime
    
    def to_dict(self) -> Dict:
        return {
            'symbol': self.symbol,
            'price': self.price,
            'volume': self.volume,
            'timestamp': self.timestamp.isoformat()
        }

class TradingEngine:
    def __init__(self, initial_balance: float = 10000.0):
        self.balance: float = initial_balance
        self.portfolio: Dict[str, float] = {}
        self.orders: List['Order'] = []
        self.market_data: Dict[str, MarketData] = {}
        self.trade_history: List[Dict] = []
        
    def update_market_price(self, symbol: str, price: float, volume: float) -> None:
        """市場価格を更新し、保留中の注文を処理"""
        self.market_data[symbol] = MarketData(
            symbol=symbol,
            price=price,
            volume=volume,
            timestamp=datetime.datetime.now()
        )
        self._process_pending_orders(symbol)
    
    def _process_pending_orders(self, symbol: str) -> None:
        """指定銘柄の保留注文を処理"""
        current_price = self.market_data[symbol].price
        executed_orders = []
        
        for order in self.orders:
            if (order.symbol == symbol and 
                order.status == OrderStatus.PENDING and
                self._should_execute_order(order, current_price)):
                
                if self._execute_order(order, current_price):
                    executed_orders.append(order)
        
        # 実行済み注文を削除
        self.orders = [o for o in self.orders if o not in executed_orders]
    
    def _should_execute_order(self, order: 'Order', current_price: float) -> bool:
        """注文実行条件をチェック"""
        if order.order_type == OrderType.BUY:
            return current_price <= order.target_price
        else:  # SELL
            return current_price >= order.target_price
    
    def _execute_order(self, order: 'Order', execution_price: float) -> bool:
        """注文を実際に実行"""
        total_cost = order.quantity * execution_price
        
        if order.order_type == OrderType.BUY:
            if self.balance >= total_cost:
                self.balance -= total_cost
                self.portfolio[order.symbol] = self.portfolio.get(order.symbol, 0) + order.quantity
                order.status = OrderStatus.EXECUTED
                self._record_trade(order, execution_price, total_cost)
                return True
        else:  # SELL
            if self.portfolio.get(order.symbol, 0) >= order.quantity:
                self.balance += total_cost
                self.portfolio[order.symbol] -= order.quantity
                if self.portfolio[order.symbol] == 0:
                    del self.portfolio[order.symbol]
                order.status = OrderStatus.EXECUTED
                self._record_trade(order, execution_price, total_cost)
                return True
        
        return False
    
    def _record_trade(self, order: 'Order', price: float, total: float) -> None:
        """取引履歴を記録"""
        trade = {
            'id': order.order_id,
            'symbol': order.symbol,
            'type': order.order_type.value,
            'quantity': order.quantity,
            'price': price,
            'total': total,
            'timestamp': datetime.datetime.now().isoformat(),
            'balance_after': self.balance
        }
        self.trade_history.append(trade)
    
    def place_order(self, symbol: str, order_type: OrderType, 
                   quantity: float, target_price: float) -> 'Order':
        """新規注文を発注"""
        order = Order(
            order_id=f"ORD_{len(self.orders)+1:04d}",
            symbol=symbol,
            order_type=order_type,
            quantity=quantity,
            target_price=target_price,
            timestamp=datetime.datetime.now()
        )
        self.orders.append(order)
        
        # 現在価格で即座に実行可能かチェック
        if symbol in self.market_data:
            current_price = self.market_data[symbol].price
            if self._should_execute_order(order, current_price):
                if self._execute_order(order, current_price):
                    self.orders.remove(order)
        
        return order
    
    def get_portfolio_value(self) -> float:
        """ポートフォリオの総評価額を計算"""
        total_value = self.balance
        
        for symbol, quantity in self.portfolio.items():
            if symbol in self.market_data:
                current_price = self.market_data[symbol].price
                total_value += quantity * current_price
        
        return total_value
    
    def get_performance_metrics(self) -> Dict:
        """パフォーマンス指標を計算"""
        current_value = self.get_portfolio_value()
        initial_value = 10000.0  # 初期残高
        
        return {
            'current_value': current_value,
            'total_return': current_value - initial_value,
            'return_percentage': ((current_value / initial_value) - 1) * 100,
            'total_trades': len(self.trade_history),
            'cash_balance': self.balance,
            'portfolio_positions': len(self.portfolio)
        }

@dataclass
class Order:
    order_id: str
    symbol: str
    order_type: OrderType
    quantity: float
    target_price: float
    timestamp: datetime.datetime
    status: OrderStatus = OrderStatus.PENDING
    
    def to_dict(self) -> Dict:
        return {
            'order_id': self.order_id,
            'symbol': self.symbol,
            'order_type': self.order_type.value,
            'quantity': self.quantity,
            'target_price': self.target_price,
            'timestamp': self.timestamp.isoformat(),
            'status': self.status.value
        }

# 使用例・テストコード
def demo_trading_simulation():
    """取引シミュレーションのデモ"""
    engine = TradingEngine(initial_balance=10000.0)
    
    # 初期市場データ設定
    engine.update_market_price("BTC", 45000.0, 1000.0)
    engine.update_market_price("ETH", 3000.0, 2000.0)
    
    # 注文発注
    btc_buy = engine.place_order("BTC", OrderType.BUY, 0.1, 44000.0)
    eth_buy = engine.place_order("ETH", OrderType.BUY, 1.0, 2950.0)
    
    print("=== Initial State ===")
    print(f"Balance: ${engine.balance:.2f}")
    print(f"Portfolio: {engine.portfolio}")
    print(f"Pending Orders: {len(engine.orders)}")
    
    # 価格変動シミュレーション
    print("\n=== Price Drop - Orders Execute ===")
    engine.update_market_price("BTC", 43500.0, 800.0)  # BTC注文実行
    engine.update_market_price("ETH", 2900.0, 1500.0)  # ETH注文実行
    
    print(f"Balance: ${engine.balance:.2f}")
    print(f"Portfolio: {engine.portfolio}")
    print(f"Pending Orders: {len(engine.orders)}")
    
    # 売り注文
    if "BTC" in engine.portfolio:
        btc_sell = engine.place_order("BTC", OrderType.SELL, 0.05, 46000.0)
    
    # 価格上昇
    print("\n=== Price Rise - Sell Order Executes ===")
    engine.update_market_price("BTC", 46500.0, 900.0)
    
    # 最終結果
    metrics = engine.get_performance_metrics()
    print(f"\n=== Performance Metrics ===")
    for key, value in metrics.items():
        if isinstance(value, float):
            print(f"{key}: {value:.2f}")
        else:
            print(f"{key}: {value}")

if __name__ == "__main__":
    demo_trading_simulation()