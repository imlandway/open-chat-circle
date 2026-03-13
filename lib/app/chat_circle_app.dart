import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/app/controllers/session_controller.dart';
import 'package:open_chat_circle/features/chat/controllers/chat_controller.dart';
import 'package:open_chat_circle/features/social/controllers/social_controller.dart';
import 'package:open_chat_circle/features/auth/view/auth_page.dart';
import 'package:open_chat_circle/app/root_page.dart';
import 'package:open_chat_circle/shared/ui/app_theme.dart';

class ChatCircleApp extends StatefulWidget {
  const ChatCircleApp({super.key});

  @override
  State<ChatCircleApp> createState() => _ChatCircleAppState();
}

class _ChatCircleAppState extends State<ChatCircleApp> {
  Object? _lastToken;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = context.read<SessionController>().session;
    final token = session?.sessionToken;
    if (_lastToken != token) {
      _lastToken = token;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        context.read<ChatController>().bindSession(session);
        context.read<SocialController>().bindSession(session);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Open Chat Circle',
      theme: buildAppTheme(),
      home: Consumer<SessionController>(
        builder: (context, sessionController, _) {
          if (sessionController.isLoading) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          if (!sessionController.isAuthenticated) {
            return const AuthPage();
          }
          return const RootPage();
        },
      ),
    );
  }
}
