import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/features/chat/controllers/chat_controller.dart';
import 'package:open_chat_circle/features/chat/view/chat_page.dart';
import 'package:open_chat_circle/features/chat/view/create_group_page.dart';

class ConversationListPage extends StatefulWidget {
  const ConversationListPage({super.key});

  @override
  State<ConversationListPage> createState() => _ConversationListPageState();
}

class _ConversationListPageState extends State<ConversationListPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatController>().refreshConversations();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ChatController>();

    return Scaffold(
      appBar: AppBar(title: const Text('聊天')),
      body: RefreshIndicator(
        onRefresh: controller.refreshConversations,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (controller.isLoading) const LinearProgressIndicator(),
            if (controller.conversations.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('还没有会话，去联系人页发起聊天，或者先建一个群。'),
                ),
              ),
            for (final conversation in controller.conversations)
              Card(
                child: ListTile(
                  title: Text(conversation.name.isEmpty ? '未命名会话' : conversation.name),
                  subtitle: Text(
                    conversation.latestMessage == null
                        ? '还没有消息'
                        : conversation.latestMessage!.type == 'image'
                            ? '[图片] ${conversation.latestMessage!.imageName}'
                            : conversation.latestMessage!.text,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: conversation.unreadCount > 0
                      ? CircleAvatar(
                          radius: 14,
                          child: Text('${conversation.unreadCount}'),
                        )
                      : null,
                  onTap: () {
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CreateGroupPage()),
          );
        },
        icon: const Icon(Icons.group_add_outlined),
        label: const Text('建群'),
      ),
    );
  }
}
