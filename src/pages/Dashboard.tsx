import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Zap,
  Settings,
  RefreshCw,
  Server,
  Radio,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

export default function Dashboard() {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const { data: accounts, refetch: refetchAccounts } = trpc.account.list.useQuery();
  const { data: monitorStatus, refetch: refetchStatus } = trpc.account.monitorStatus.useQuery();

  const { data: dashboard } = trpc.monitor.dashboard.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, refetchInterval: 5000 }
  );

  const { data: transfers, refetch: refetchTransfers } =
    trpc.monitor.transfers.useQuery(
      { accountId: selectedAccountId! },
      { enabled: !!selectedAccountId }
    );

  const syncTransfers = trpc.account.syncTransfers.useMutation({
    onSuccess: (result) => {
      toast.success(
        `充提记录同步完成: ${result.deposits} 笔充值, ${result.withdrawals} 笔提现`
      );
      refetchTransfers();
    },
    onError: (err) => toast.error(err.message),
  });

  const startMonitor = trpc.account.startMonitor.useMutation({
    onSuccess: () => {
      toast.success("监控已启动");
      refetchStatus();
      refetchAccounts();
    },
    onError: (err) => toast.error(err.message),
  });

  const stopMonitor = trpc.account.stopMonitor.useMutation({
    onSuccess: () => {
      toast.success("监控已停止");
      refetchStatus();
      refetchAccounts();
    },
    onError: (err) => toast.error(err.message),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500 hover:bg-green-600">已连接</Badge>;
      case "disconnected":
        return <Badge variant="secondary">已断开</Badge>;
      case "error":
        return <Badge variant="destructive">错误</Badge>;
      case "reconnecting":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">重连中</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">严重</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">警告</Badge>;
      default:
        return <Badge variant="outline">信息</Badge>;
    }
  };

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId);
  const accountMonitorStatus = monitorStatus?.find(
    (m) => m.accountId === selectedAccountId
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Binance 账户监控</h1>
              <p className="text-sm text-muted-foreground">
                实时账户余额 / 订单 / 持仓监控
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" />
                设置
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Account Selector */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">选择账户:</span>
              </div>
              <Select
                value={selectedAccountId?.toString() || ""}
                onValueChange={(v) => setSelectedAccountId(Number(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="选择一个账户" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} {account.isActive ? "(活跃)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedAccount && (
                <>
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">现货:</span>
                    {getStatusBadge(accountMonitorStatus?.spot || "disconnected")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">合约:</span>
                    {getStatusBadge(accountMonitorStatus?.futures || "disconnected")}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => startMonitor.mutate({ id: selectedAccount.id })}
                      disabled={startMonitor.isPending}
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      启动监控
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stopMonitor.mutate({ id: selectedAccount.id })}
                      disabled={stopMonitor.isPending}
                    >
                      停止
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => refetchStatus()}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {!selectedAccountId ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Activity className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg">请选择一个账户开始监控</p>
            <p className="text-sm mt-2">
              如果没有账户，请先到设置页面添加 API Key
            </p>
            <Button className="mt-4" asChild>
              <Link to="/settings">前往设置</Link>
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-6 lg:w-[720px]">
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="balances">余额</TabsTrigger>
              <TabsTrigger value="positions">持仓</TabsTrigger>
              <TabsTrigger value="orders">订单</TabsTrigger>
              <TabsTrigger value="transfers">充提</TabsTrigger>
              <TabsTrigger value="alerts">告警</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      现货资产数
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboard?.spotBalances?.length || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      合约资产数
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboard?.futuresBalances?.length || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      当前持仓
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboard?.positions?.length || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      未完成订单
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboard?.openOrders?.length || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      近20笔充提
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboard?.recentTransfers?.length || 0}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Alerts */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      最近告警
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      {dashboard?.recentAlerts?.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          暂无告警
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {dashboard?.recentAlerts?.map((alert) => (
                            <div
                              key={alert.id}
                              className="p-3 rounded-lg border bg-card/50"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">
                                  {alert.title}
                                </span>
                                {getSeverityBadge(alert.severity)}
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-pre-line">
                                {alert.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {alert.createdAt
                                  ? new Date(alert.createdAt).toLocaleString()
                                  : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Recent Events */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      最近事件
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      {dashboard?.recentEvents?.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          暂无事件
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {dashboard?.recentEvents?.map((event) => (
                            <div
                              key={event.id}
                              className="p-2 rounded border text-sm"
                            >
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-xs">
                                  {event.source}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {event.eventType}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {event.createdAt
                                  ? new Date(event.createdAt).toLocaleString()
                                  : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Balances Tab */}
            <TabsContent value="balances">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>现货余额</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">资产</th>
                            <th className="text-right py-2 px-2">可用</th>
                            <th className="text-right py-2 px-2">冻结</th>
                            <th className="text-right py-2 px-2">总计</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard?.spotBalances?.map((b) => {
                            const free = parseFloat(String(b.free));
                            const locked = parseFloat(String(b.locked));
                            return (
                              <tr key={b.id} className="border-b last:border-0">
                                <td className="py-2 px-2 font-medium">{b.asset}</td>
                                <td className="text-right py-2 px-2">
                                  {free.toFixed(8)}
                                </td>
                                <td className="text-right py-2 px-2">
                                  {locked.toFixed(8)}
                                </td>
                                <td className="text-right py-2 px-2 font-medium">
                                  {(free + locked).toFixed(8)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>合约余额</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">资产</th>
                            <th className="text-right py-2 px-2">钱包余额</th>
                            <th className="text-right py-2 px-2">全仓余额</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard?.futuresBalances?.map((b) => (
                            <tr key={b.id} className="border-b last:border-0">
                              <td className="py-2 px-2 font-medium">{b.asset}</td>
                              <td className="text-right py-2 px-2">
                                {b.walletBalance
                                  ? parseFloat(String(b.walletBalance)).toFixed(8)
                                  : "-"}
                              </td>
                              <td className="text-right py-2 px-2">
                                {b.crossWalletBalance
                                  ? parseFloat(String(b.crossWalletBalance)).toFixed(8)
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Positions Tab */}
            <TabsContent value="positions">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    合约持仓
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboard?.positions?.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      当前无持仓
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {dashboard?.positions?.map((pos) => {
                        const amt = parseFloat(String(pos.positionAmt));
                        const pnl = parseFloat(String(pos.unrealizedPnl || 0));
                        const isLong = amt > 0;
                        return (
                          <Card key={pos.id} className="border-l-4 border-l-primary">
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-lg">
                                  {pos.symbol}
                                </span>
                                <Badge
                                  variant={isLong ? "default" : "secondary"}
                                >
                                  {pos.positionSide}
                                </Badge>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    持仓数量
                                  </span>
                                  <span
                                    className={
                                      isLong ? "text-green-600" : "text-red-600"
                                    }
                                  >
                                    {amt.toFixed(4)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    开仓价
                                  </span>
                                  <span>
                                    {pos.entryPrice
                                      ? parseFloat(String(pos.entryPrice)).toFixed(2)
                                      : "-"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    未实现盈亏
                                  </span>
                                  <span
                                    className={
                                      pnl >= 0 ? "text-green-600" : "text-red-600"
                                    }
                                  >
                                    {pnl >= 0 ? "+" : ""}
                                    {pnl.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    保证金模式
                                  </span>
                                  <span>{pos.marginType || "-"}</span>
                                </div>
                                {pos.leverage && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      杠杆
                                    </span>
                                    <span>{pos.leverage}x</span>
                                  </div>
                                )}
                                {pos.liquidationPrice && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      强平价
                                    </span>
                                    <span className="text-red-500">
                                      {parseFloat(String(pos.liquidationPrice)).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>未完成订单</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    {dashboard?.openOrders?.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        当前无未完成订单
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">交易对</th>
                            <th className="text-left py-2 px-2">方向</th>
                            <th className="text-left py-2 px-2">类型</th>
                            <th className="text-right py-2 px-2">价格</th>
                            <th className="text-right py-2 px-2">数量</th>
                            <th className="text-right py-2 px-2">已成交</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard?.openOrders?.map((order) => (
                            <tr key={order.id} className="border-b last:border-0">
                              <td className="py-2 px-2 font-medium">
                                {order.symbol}
                              </td>
                              <td className="py-2 px-2">
                                <Badge
                                  variant={
                                    order.side === "BUY" ? "default" : "secondary"
                                  }
                                >
                                  {order.side}
                                </Badge>
                              </td>
                              <td className="py-2 px-2">{order.type}</td>
                              <td className="text-right py-2 px-2">
                                {order.price || "市价"}
                              </td>
                              <td className="text-right py-2 px-2">
                                {order.quantity}
                              </td>
                              <td className="text-right py-2 px-2">
                                {order.executedQty}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Transfers Tab */}
            <TabsContent value="transfers">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowDownLeft className="h-5 w-5" />
                      <ArrowUpRight className="h-5 w-5" />
                      充提记录
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        selectedAccountId &&
                        syncTransfers.mutate({ id: selectedAccountId })
                      }
                      disabled={syncTransfers.isPending || !selectedAccountId}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-1 ${
                          syncTransfers.isPending ? "animate-spin" : ""
                        }`}
                      />
                      同步近3天
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    {transfers?.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        暂无充提记录，点击右上角同步
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">类型</th>
                            <th className="text-left py-2 px-2">资产</th>
                            <th className="text-right py-2 px-2">数量</th>
                            <th className="text-left py-2 px-2">网络</th>
                            <th className="text-left py-2 px-2">状态</th>
                            <th className="text-left py-2 px-2">时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transfers?.map((transfer) => {
                            const isDeposit = transfer.type === "deposit";
                            return (
                              <tr
                                key={transfer.id}
                                className="border-b last:border-0"
                              >
                                <td className="py-2 px-2">
                                  <Badge
                                    variant={
                                      isDeposit ? "default" : "secondary"
                                    }
                                    className="flex items-center gap-1 w-fit"
                                  >
                                    {isDeposit ? (
                                      <ArrowDownLeft className="h-3 w-3" />
                                    ) : (
                                      <ArrowUpRight className="h-3 w-3" />
                                    )}
                                    {isDeposit ? "充值" : "提现"}
                                  </Badge>
                                </td>
                                <td className="py-2 px-2 font-medium">
                                  {transfer.asset}
                                </td>
                                <td className="text-right py-2 px-2">
                                  {parseFloat(String(transfer.amount)).toFixed(8)}
                                </td>
                                <td className="py-2 px-2">
                                  {transfer.network || "-"}
                                </td>
                                <td className="py-2 px-2">
                                  {transfer.status}
                                </td>
                                <td className="py-2 px-2 text-muted-foreground">
                                  {transfer.transferTime
                                    ? new Date(
                                        transfer.transferTime
                                      ).toLocaleString()
                                    : "-"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Alerts Tab */}
            <TabsContent value="alerts">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    告警历史
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {dashboard?.recentAlerts?.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        暂无告警记录
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {dashboard?.recentAlerts?.map((alert) => (
                          <div
                            key={alert.id}
                            className="p-4 rounded-lg border bg-card/50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{alert.title}</span>
                              <div className="flex gap-2">
                                {getSeverityBadge(alert.severity)}
                                <Badge variant="outline">{alert.alertType}</Badge>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-line">
                              {alert.message}
                            </p>
                            {alert.symbol && (
                              <p className="text-xs text-muted-foreground mt-1">
                                交易对: {alert.symbol}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {alert.createdAt
                                ? new Date(alert.createdAt).toLocaleString()
                                : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
