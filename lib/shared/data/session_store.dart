import 'dart:convert';

import 'package:open_chat_circle/models/app_session.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SessionStore {
  static const _key = 'app_session';

  Future<AppSession?> load() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_key);
    if (raw == null) {
      return null;
    }
    return AppSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> save(AppSession session) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_key, jsonEncode(session.toJson()));
  }

  Future<void> clear() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_key);
  }
}
