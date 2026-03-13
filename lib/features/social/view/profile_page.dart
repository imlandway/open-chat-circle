import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/app/controllers/session_controller.dart';
import 'package:open_chat_circle/features/social/controllers/social_controller.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final TextEditingController _nicknameController;
  late final TextEditingController _avatarUrlController;

  @override
  void initState() {
    super.initState();
    _nicknameController = TextEditingController();
    _avatarUrlController = TextEditingController();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final user = context.read<SessionController>().user!;
    _nicknameController.text = user.nickname;
    _avatarUrlController.text = user.avatarUrl;
  }

  @override
  void dispose() {
    _nicknameController.dispose();
    _avatarUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sessionController = context.read<SessionController>();
    final socialController = context.read<SocialController>();
    final user = context.watch<SessionController>().user!;

    return Scaffold(
      appBar: AppBar(title: const Text('个人资料')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('账号：${user.account}'),
                  const SizedBox(height: 8),
                  Text('身份：${user.isAdmin ? '管理员' : '普通成员'}'),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _nicknameController,
                    decoration: const InputDecoration(labelText: '昵称'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _avatarUrlController,
                    decoration: const InputDecoration(labelText: '头像 URL'),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () async {
                      final updated = await socialController.updateProfile(
                        nickname: _nicknameController.text.trim(),
                        avatarUrl: _avatarUrlController.text.trim(),
                      );
                      await sessionController.updateLocalUser(updated);
                      if (!context.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('资料已更新')),
                      );
                    },
                    child: const Text('保存'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
