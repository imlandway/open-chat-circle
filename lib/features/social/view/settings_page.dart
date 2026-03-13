import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/app/controllers/session_controller.dart';
import 'package:open_chat_circle/config/app_config.dart';
import 'package:open_chat_circle/features/social/controllers/social_controller.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final sessionController = context.read<SessionController>();
    final socialController = context.watch<SocialController>();
    final config = context.read<AppConfig>();
    final user = context.watch<SessionController>().user!;

    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              title: const Text('后端地址'),
              subtitle: Text(config.apiBaseUrl),
            ),
          ),
          if (user.isAdmin)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('邀请码管理'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () async {
                        await socialController.createInvite(
                          uses: 5,
                          expiresAt: DateTime.now().add(const Duration(days: 30)),
                        );
                      },
                      child: const Text('生成一个 30 天邀请码'),
                    ),
                    const SizedBox(height: 12),
                    for (final invite in socialController.invites)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${invite.code} · ${invite.usedCount}/${invite.maxUses} · ${invite.status}',
                        ),
                      ),
                  ],
                ),
              ),
            ),
          Card(
            child: ListTile(
              title: const Text('退出登录'),
              trailing: const Icon(Icons.logout),
              onTap: sessionController.logout,
            ),
          ),
        ],
      ),
    );
  }
}
