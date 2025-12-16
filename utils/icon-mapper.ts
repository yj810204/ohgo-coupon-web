import { 
  FiClipboard, 
  FiGift 
} from 'react-icons/fi';
import {
  IoGameControllerOutline,
  IoBoatOutline,
  IoPersonOutline,
  IoChatbubblesOutline,
  IoPeopleOutline,
  IoCalendarOutline,
  IoNotificationsOutline,
  IoSettingsOutline,
  IoImageOutline,
  IoChevronUpOutline,
  IoChevronDownOutline,
  IoAddOutline,
  IoTrashOutline,
  IoPencilOutline,
  IoCreateOutline,
  IoHappyOutline,
  IoCheckmarkCircleOutline,
  IoArrowBackOutline,
  IoConstructOutline,
} from 'react-icons/io5';

// 아이콘 이름과 실제 컴포넌트 매핑
const iconMap: Record<string, React.ComponentType<any>> = {
  // Feather Icons
  FiClipboard,
  FiGift,
  
  // Ionicons
  IoGameControllerOutline,
  IoBoatOutline,
  IoPersonOutline,
  IoChatbubblesOutline,
  IoPeopleOutline,
  IoCalendarOutline,
  IoNotificationsOutline,
  IoSettingsOutline,
  IoImageOutline,
  IoChevronUpOutline,
  IoChevronDownOutline,
  IoAddOutline,
  IoTrashOutline,
  IoPencilOutline,
  IoCreateOutline,
  IoHappyOutline,
  IoCheckmarkCircleOutline,
  IoArrowBackOutline,
  IoConstructOutline,
};

/**
 * 아이콘 이름 문자열을 실제 아이콘 컴포넌트로 변환
 */
export function getIconComponent(iconName: string): React.ComponentType<any> | null {
  return iconMap[iconName] || null;
}

/**
 * 사용 가능한 모든 아이콘 이름 목록 반환
 */
export function getAvailableIconNames(): string[] {
  return Object.keys(iconMap).sort();
}

/**
 * 아이콘 컴포넌트 목록 반환 (관리자 페이지에서 선택용)
 */
export function getAvailableIcons(): Array<{ name: string; component: React.ComponentType<any> }> {
  return Object.entries(iconMap).map(([name, component]) => ({
    name,
    component,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

