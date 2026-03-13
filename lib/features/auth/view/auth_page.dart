import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/app/controllers/session_controller.dart';
import 'package:open_chat_circle/shared/ui/widgets/async_button.dart';

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _loginAccountController = TextEditingController();
  final _loginPasswordController = TextEditingController();
  final _inviteCodeController = TextEditingController();
  final _nicknameController = TextEditingController();
  final _registerPasswordController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _loginAccountController.dispose();
    _loginPasswordController.dispose();
    _inviteCodeController.dispose();
    _nicknameController.dispose();
    _registerPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sessionController = context.watch<SessionController>();

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFE6F4F1),
              Color(0xFFF9FBF8),
            ],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Open Chat Circle',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '一个接口开放、可以自由接入 API 的朋友聊天空间。',
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                        const SizedBox(height: 20),
                        TabBar(
                          controller: _tabController,
                          tabs: const [
                            Tab(text: '登录'),
                            Tab(text: '邀请码注册'),
                          ],
                        ),
                        const SizedBox(height: 20),
                        SizedBox(
                          height: 340,
                          child: TabBarView(
                            controller: _tabController,
                            children: [
                              _buildLoginForm(context, sessionController),
                              _buildRegisterForm(context, sessionController),
                            ],
                          ),
                        ),
                        if (sessionController.error != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            sessionController.error!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        const Text('开发默认邀请码：OPEN-CIRCLE-2026'),
                        const Text('开发管理员账号：captain / chatcircle123'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoginForm(BuildContext context, SessionController sessionController) {
    return Column(
      children: [
        TextField(
          controller: _loginAccountController,
          decoration: const InputDecoration(labelText: '账号'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _loginPasswordController,
          obscureText: true,
          decoration: const InputDecoration(labelText: '密码'),
        ),
        const Spacer(),
        SizedBox(
          width: double.infinity,
          child: AsyncButton(
            label: '登录',
            isLoading: sessionController.isSubmitting,
            onPressed: () async {
              await sessionController.login(
                account: _loginAccountController.text.trim(),
                password: _loginPasswordController.text,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildRegisterForm(BuildContext context, SessionController sessionController) {
    return Column(
      children: [
        TextField(
          controller: _inviteCodeController,
          decoration: const InputDecoration(labelText: '邀请码'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _nicknameController,
          decoration: const InputDecoration(labelText: '昵称'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _registerPasswordController,
          obscureText: true,
          decoration: const InputDecoration(labelText: '密码（至少 8 位）'),
        ),
        const Spacer(),
        SizedBox(
          width: double.infinity,
          child: AsyncButton(
            label: '注册并进入',
            isLoading: sessionController.isSubmitting,
            onPressed: () async {
              await sessionController.register(
                inviteCode: _inviteCodeController.text.trim(),
                nickname: _nicknameController.text.trim(),
                password: _registerPasswordController.text,
              );
            },
          ),
        ),
      ],
    );
  }
}
