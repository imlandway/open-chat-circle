import 'package:open_chat_circle/models/app_user.dart';

class AppSession {
  const AppSession({
    required this.sessionToken,
    required this.user,
  });

  final String sessionToken;
  final AppUser user;

  factory AppSession.fromJson(Map<String, dynamic> json) {
    return AppSession(
      sessionToken: json['sessionToken'] as String,
      user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'sessionToken': sessionToken,
      'user': user.toJson(),
    };
  }

  AppSession copyWith({
    String? sessionToken,
    AppUser? user,
  }) {
    return AppSession(
      sessionToken: sessionToken ?? this.sessionToken,
      user: user ?? this.user,
    );
  }
}
