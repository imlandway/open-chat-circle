import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/app/chat_circle_app.dart';
import 'package:open_chat_circle/app/controllers/session_controller.dart';
import 'package:open_chat_circle/config/app_config.dart';
import 'package:open_chat_circle/features/auth/data/auth_api.dart';
import 'package:open_chat_circle/features/chat/controllers/chat_controller.dart';
import 'package:open_chat_circle/features/chat/data/chat_api.dart';
import 'package:open_chat_circle/features/social/controllers/social_controller.dart';
import 'package:open_chat_circle/features/social/data/social_api.dart';
import 'package:open_chat_circle/shared/data/api_client.dart';
import 'package:open_chat_circle/shared/data/realtime_client.dart';
import 'package:open_chat_circle/shared/data/session_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final config = AppConfig.fromEnvironment();
  final apiClient = ApiClient(config: config);
  final sessionController = SessionController(
    authApi: AuthApi(apiClient),
    sessionStore: SessionStore(),
  );
  await sessionController.bootstrap();

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: config),
        Provider.value(value: apiClient),
        ChangeNotifierProvider.value(value: sessionController),
        ChangeNotifierProvider(
          create: (_) => ChatController(
            chatApi: ChatApi(apiClient),
            realtimeClient: RealtimeClient(config),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => SocialController(
            socialApi: SocialApi(apiClient),
          ),
        ),
      ],
      child: const ChatCircleApp(),
    ),
  );
}
