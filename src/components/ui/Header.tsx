import React from 'react';
import { View, StatusBar } from 'react-native';

import FluentLogo from '../../assets/icons/fluent-logo-white.svg';
import { appStyles } from '../../app/appStyles';

export const Header: React.FC = () => {
  return (
    <View style={appStyles.headerContainer}>
      <StatusBar backgroundColor="#0b50d0" barStyle="light-content" />
      <View style={appStyles.headerTopRow}>
        <View style={appStyles.headerLogoWrapper}>
          <FluentLogo width={160} height={54} />
        </View>
      </View>
    </View>
  );
};
