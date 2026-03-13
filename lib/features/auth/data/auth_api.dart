import 'package:open_chat_circle/models/app_session.dart';
import 'package:open_chat_circle/models/app_user.dart';
import 'package:open_chat_circle/shared/data/api_client.dart';

class AuthApi {
  const AuthApi(this._client);

  final ApiClient _client;

  Future<AppSession> registerWithInvite({
    required String inviteCode,
    required String nickname,
    required String password,
  }) async {
    final response = await _client.post(
      '/api/auth/register-with-invite',
      body: {
        'inviteCode': inviteCode,
        'nickname': nickname,
        'password': password,
      },
    );
    return AppSession.fromJson(response);
  }

  Future<AppSession> login({
    required String account,
    required String password,
  }) async {
    final response = await _client.post(
      '/api/auth/login',
      body: {
        'account': account,
        'password': password,
      },
    );
    return AppSession.fromJson(response);
  }

  Future<AppUser> me(String token) async {
    final response = await _client.get('/api/auth/me', token: token);
    return AppUser.fromJson(response['user'] as Map<String, dynamic>);
  }
}
