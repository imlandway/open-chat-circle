import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/features/chat/controllers/chat_controller.dart';
import 'package:open_chat_circle/features/chat/view/chat_page.dart';
import 'package:open_chat_circle/features/social/controllers/social_controller.dart';

class ContactsPage extends StatefulWidget {
  const ContactsPage({super.key});

  @override
  State<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends State<ContactsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SocialController>().refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final socialController = context.watch<SocialController>();
    final chatController = context.read<ChatController>();

    return Scaffold(
      appBar: AppBar(title: const Text('联系人')),
      body: RefreshIndicator(
        onRefresh: socialController.refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final contact in socialController.contacts)
              Card(
                child: ListTile(
                  title: Text(contact.nickname),
                  subtitle: Text(contact.account),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    final conversation = await chatController.ensureDirectConversation(contact.id);
                    if (!mounted) {
                      return;
                    }
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ChatPage(conversation: conversation),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
