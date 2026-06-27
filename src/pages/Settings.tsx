import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Play,
  Square,
  KeyRound,
  Bell,
  Clock,
  Settings2,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

export default function Settings() {
  const [newAccountName, setNewAccountName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiSecret, setNewApiSecret] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: accounts, refetch: refetchAccounts } = trpc.account.list.useQuery();
  const { data: settings, refetch: refetchSettings } = trpc.settings.get.useQuery();
  const { data: monitorStatus, refetch: refetchStatus } = trpc.account.monitorStatus.useQuery();

  const createAccount = trpc.account.create.useMutation({
    onSuccess: () => {
      toast.success("账户添加成功");
      setNewAccountName("");
      setNewApiKey("");
      setNewApiSecret("");
      setDialogOpen(false);
      refetchAccounts();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteAccount = trpc.account.delete.useMutation({
    onSuccess: () => {
      toast.success("账户已删除");
      refetchAccounts();
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const startMonitor = trpc.account.startMonitor.useMutation({
    onSuccess: () => {
      toast.success("监控已启动");
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const stopMonitor = trpc.account.stopMonitor.useMutation({
    onSuccess: () => {
      toast.success("监控已停止");
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("设置已保存");
      refetchSettings();
    },
    onError: (err) => toast.error(err.message),
  });

  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [reconcileInterval, setReconcileInterval] = useState("300");

  const handleSaveSettings = () => {
    updateSettings.mutate({
      telegramBotToken: telegramToken || undefined,
      telegramChatId: telegramChatId || undefined,
      reconcileIntervalSeconds: reconcileInterval
        ? parseInt(reconcileInterval)
        : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回
              </Link>
            </Button>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">系统设置</h1>
              <p className="text-sm text-muted-foreground">
                管理账户和通知配置
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Accounts Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                API 账户管理
              </CardTitle>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    添加账户
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>添加 Binance API 账户</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">账户名称</Label>
                      <Input
                        id="name"
                        placeholder="例如：主账户"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key</Label>
                      <Input
                        id="apiKey"
                        placeholder="your-api-key"
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiSecret">API Secret</Label>
                      <Input
                        id="apiSecret"
                        type="password"
                        placeholder="your-api-secret"
                        value={newApiSecret}
                        onChange={(e) => setNewApiSecret(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() =>
                        createAccount.mutate({
                          name: newAccountName,
                          apiKey: newApiKey,
                          apiSecret: newApiSecret,
                        })
                      }
                      disabled={
                        createAccount.isPending ||
                        !newAccountName ||
                        !newApiKey ||
                        !newApiSecret
                      }
                    >
                      {createAccount.isPending ? "添加中..." : "添加账户"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                {accounts?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>暂无账户，请添加一个 Binance API 账户</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts?.map((account) => {
                      const status = monitorStatus?.find(
                        (m) => m.accountId === account.id
                      );
                      const isRunning = status?.running;

                      return (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {account.name}
                              </span>
                              {account.isActive ? (
                                <Badge
                                  variant="outline"
                                  className="text-green-600"
                                >
                                  活跃
                                </Badge>
                              ) : (
                                <Badge variant="outline">非活跃</Badge>
                              )}
                              {isRunning && (
                                <Badge className="bg-green-500">监控中</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              API Key: {account.apiKey.slice(0, 8)}...
                              {account.apiKey.slice(-4)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {isRunning ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  stopMonitor.mutate({ id: account.id })
                                }
                                disabled={stopMonitor.isPending}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  startMonitor.mutate({ id: account.id })
                                }
                                disabled={startMonitor.isPending}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => {
                                if (
                                  confirm(
                                    `确定要删除账户 "${account.name}" 吗？`
                                  )
                                ) {
                                  deleteAccount.mutate({ id: account.id });
                                }
                              }}
                              disabled={deleteAccount.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Telegram Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Telegram 告警配置
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="botToken">Bot Token</Label>
                    <Input
                      id="botToken"
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                      defaultValue={settings?.telegramBotToken || ""}
                      onChange={(e) => setTelegramToken(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chatId">Chat ID</Label>
                    <Input
                      id="chatId"
                      placeholder="-1001234567890"
                      defaultValue={settings?.telegramChatId || ""}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                    />
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    当前配置:
                    {settings?.telegramBotToken ? (
                      <span className="text-green-600 ml-1">已配置 Bot Token</span>
                    ) : (
                      <span className="text-yellow-600 ml-1">未配置</span>
                    )}
                    {settings?.telegramChatId ? (
                      <span className="text-green-600 ml-1">, 已配置 Chat ID</span>
                    ) : (
                      <span className="text-yellow-600 ml-1">, 未配置 Chat ID</span>
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                系统配置
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reconcileInterval">
                      对账间隔（秒，最小60）
                    </Label>
                    <Input
                      id="reconcileInterval"
                      type="number"
                      min={60}
                      max={3600}
                      placeholder="300"
                      defaultValue={
                        settings?.reconcileIntervalSeconds?.toString() || "300"
                      }
                      onChange={(e) => setReconcileInterval(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={updateSettings.isPending}
              className="w-full md:w-auto"
            >
              {updateSettings.isPending ? "保存中..." : "保存设置"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
