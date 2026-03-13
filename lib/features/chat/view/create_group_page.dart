import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/features/chat/controllers/chat_controller.dart';
import 'package:open_chat_circle/features/chat/view/chat_page.dart';
import 'package:open_chat_circle/features/social/controllers/social_controller.dart';

class CreateGroupPage extends StatefulWidget {
  const CreateGroupPage({super.key});

  @override
  State<CreateGroupPage> createState() => _CreateGroupPageState();
}

class _CreateGroupPageState extends State<CreateGroupPage> {
  final _nameController = TextEditingController();
  final Set<String> _selectedUserIds = {};

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final socialController = context.watch<SocialController>();
    final chatController = context.read<ChatController>();

    return Scaffold(
      appBar: AppBar(title: const Text('创建群聊')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '群名称'),
          ),
          const SizedBox(height: 16),
          const Text('选择成员'),
          const SizedBox(height: 12),
          for (final contact in socialController.contacts)
            CheckboxListTile(
              value: _selectedUserIds.contains(contact.id),
              title: Text(contact.nickname),
              subtitle: Text(contact.account),
              onChanged: (checked) {
                setState(() {
                  if (checked ?? false) {
                    _selectedUserIds.add(contact.id);
                  } else {
                    _selectedUserIds.remove(contact.id);
                  }
                });
              },
            ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () async {
              final conversation = await chatController.createGroup(
                name: _nameController.text.trim(),
                memberIds: _selectedUserIds.toList(),
              );
              if (!mounted) {
                return;
              }
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(
                  builder: (_) => ChatPage(conversation: conversation),
                ),
              );
            },
            child: const Text('创建'),
          ),
        ],
      ),
    );
  }
}
