import 'package:flutter/foundation.dart';
import 'package:open_chat_circle/features/auth/data/auth_api.dart';
import 'package:open_chat_circle/models/app_session.dart';
import 'package:open_chat_circle/models/app_user.dart';
import 'package:open_chat_circle/shared/data/session_store.dart';

class SessionController extends ChangeNotifier {
  SessionController({
    required AuthApi authApi,
    required SessionStore sessionStore,
  })  : _authApi = authApi,
        _sessionStore = sessionStore;

  final AuthApi _authApi;
  final SessionStore _sessionStore;

  AppSession? _session;
  bool _isLoading = true;
  bool _isSubmitting = false;
  String? _error;

  AppSession? get session => _session;
  AppUser? get user => _session?.user;
  bool get isAuthenticated => _session != null;
  bool get isLoading => _isLoading;
  bool get isSubmitting => _isSubmitting;
  String? get error => _error;

  Future<void> bootstrap() async {
    _isLoading = true;
    notifyListeners();

    final stored = await _sessionStore.load();
    if (stored == null) {
      _isLoading = false;
      notifyListeners();
      return;
    }

    try {
      final me = await _authApi.me(stored.sessionToken);
      _session = stored.copyWith(user: me);
    } catch (_) {
      await _sessionStore.clear();
      _session = null;
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> login({
    required String account,
    required String password,
  }) async {
    await _perform(() async {
      final session = await _authApi.login(account: account, password: password);
      _session = session;
      await _sessionStore.save(session);
    });
  }

  Future<void> register({
    required String inviteCode,
    required String nickname,
    required String password,
  }) async {
    await _perform(() async {
      final session = await _authApi.registerWithInvite(
        inviteCode: inviteCode,
        nickname: nickname,
        password: password,
      );
      _session = session;
      await _sessionStore.save(session);
    });
  }

  Future<void> refreshMe() async {
    if (_session == null) {
      return;
    }
    final me = await _authApi.me(_session!.sessionToken);
    _session = _session!.copyWith(user: me);
    await _sessionStore.save(_session!);
    notifyListeners();
  }

  Future<void> updateLocalUser(AppUser user) async {
    if (_session == null) {
      return;
    }
    _session = _session!.copyWith(user: user);
    await _sessionStore.save(_session!);
    notifyListeners();
  }

  Future<void> logout() async {
    _session = null;
    _error = null;
    await _sessionStore.clear();
    notifyListeners();
  }

  Future<void> _perform(Future<void> Function() action) async {
    _isSubmitting = true;
    _error = null;
    notifyListeners();
    try {
      await action();
    } catch (error) {
      _error = error.toString();
    } finally {
      _isSubmitting = false;
      notifyListeners();
    }
  }
}
