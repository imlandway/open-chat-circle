import 'package:flutter/material.dart';
import 'package:open_chat_circle/features/chat/view/conversation_list_page.dart';
import 'package:open_chat_circle/features/social/view/contacts_page.dart';
import 'package:open_chat_circle/features/social/view/profile_page.dart';
import 'package:open_chat_circle/features/social/view/settings_page.dart';

class RootPage extends StatefulWidget {
  const RootPage({super.key});

  @override
  State<RootPage> createState() => _RootPageState();
}

class _RootPageState extends State<RootPage> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    const pages = [
      ConversationListPage(),
      ContactsPage(),
      ProfilePage(),
      SettingsPage(),
    ];

    return Scaffold(
      body: SafeArea(child: pages[_currentIndex]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) => setState(() => _currentIndex = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: '聊天'),
          NavigationDestination(icon: Icon(Icons.people_outline), label: '联系人'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: '设置'),
        ],
      ),
    );
  }
}
