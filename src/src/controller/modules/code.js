import axios from 'axios';
import invariant from 'invariant';

import { logRecorder } from './log';
import { seq, Icon, Repo, RepoVersion } from '../../model';
import { iconStatus, startCode, endCode } from '../../constants/utils';

// 表示系统占用的图标 path
const disabledCodePath = ' M889 169L768 290V848C768 856.8 760.8 864 752 864H272C263.2 ' +
  '864 256 856.8 256 848V802L169 889C159.6 898.4 144.4 898.4 135 889C125.6 879.6 125.6 ' +
  '864.4 135 855L256 734V176C256 167.2 263.2 160 272 160H752C760.8 160 768 167.2 768 ' +
  '176V222L855 135C859.6 130.4 865.8 128 872 128S884.2 130.4 889 135C898.4 144.4 898.4 ' +
  '159.6 889 169zM288 832H736V322L288 770V832zM736 192H288V702L736 254V192z';

const isString = (string) => Object.prototype.toString.call(string) === '[object String]';

export function *getDisabledCode(next) {
  const icon = yield Icon.findAll({
    attributes: ['id', 'code'],
    where: {
      status: {
        $eq: iconStatus.DISABLED,
      },
    },
    order: 'code ASC',
  });
  this.state.respond = icon;
  yield next;
}

export function *setDisabledCode(next) {
  const { codes } = this.param;
  const { userId } = this.state.user;
  invariant(codes instanceof Array, '传入的 codes 不合法，期望是数组');
  // codeList：查询条件（icons 表中已存在的编码）
  const codeList = codes.map(item => {
    const { mobile, os, other } = isString(item.description)
      ? JSON.parse(item.description)
      : item.description || {};
    invariant(mobile.length < 100, '机型信息字段过长，请删减');
    invariant(os.length < 100, '系统信息字段过长，请删减');
    invariant(other.length < 2000, '其他信息字段过长，请删减');
    return parseInt(+item.code, 10);
  });
  const icons = yield Icon.findAll({
    attributes: ['id', 'code', 'status'],
    where: {
      code: {
        $in: codeList,
      },
      status: {
        $in: [iconStatus.RESOLVED, iconStatus.DISABLED],
      },
    },
  });

  // icons 表中已存在的，status 为 18/20 的编码
  const existingCodes = [];
  // icons 表中不存在的，尚未分配的编码
  const newCodes = [];
  const _icons = icons.map(item => item.code);
  // 过滤掉已经被标记为问题编码的数据
  const disabledIcons = [];
  icons.forEach(item => {
    if (item.status === iconStatus.DISABLED) {
      disabledIcons.push(item.code);
    }
  });
  const _codes = codes.filter(code => disabledIcons.indexOf(parseInt(+code.code, 10)) === -1);

  _codes.forEach(item => {
    if (_icons.indexOf(parseInt(+item.code, 10)) > -1) {
      existingCodes.push(item);
    } else {
      newCodes.push(item);
    }
  });

  const t = seq.transaction(transaction => {
    let existingIcon = null;
    const canUseCodes = [];
    const idList = [];
    // 将历史图标（分配的编码将被设置为系统占用）状态置为 DISABLED
    const existingIconInfo = existingCodes.map((item, index) => Icon.update({
      status: iconStatus.DISABLED,
      description: isString(item.description) ? item.description : JSON.stringify(item.description),
      applyTime: item.time || new Date(),
    }, {
      where: {
        code: parseInt(+item.code, 10),
        status: iconStatus.RESOLVED,
      },
      transaction,
    })
    .then(() => Icon.findAll({
      attributes: ['code'],
      where: { status: { $in: [iconStatus.DISABLED, iconStatus.RESOLVED] } },
      order: 'code',
      transaction,
    }))
    .then((allIcons) => {
      // 取所有可用编码
      const iconInfo = {};

      allIcons.forEach(icon => {
        const iconCode = icon && icon.code;
        iconInfo[`code${iconCode}`] = iconCode && true;
      });
      for (let i = parseInt(startCode, 10); i <= parseInt(endCode, 10); i++) {
        if (!iconInfo[`code${i}`]) {
          canUseCodes.push(i);
        }
      }
      return Icon.findOne({
        where: {
          code: parseInt(+item.code, 10),
          status: iconStatus.RESOLVED,
        },
        include: [{
          model: Repo,
          through: {
            model: RepoVersion,
            version: '0.0.0',
          },
        }],
        raw: true,
      });
    })
    .then((icon) => {
      // 将历史图标设置为系统占用后，需重新插入一条数据并重新编码
      existingIcon = icon;
      const { id, name, fontClass, tags, path, createTime } = existingIcon;
      idList[index] = idList[index] || {};
      Object.assign(idList[index], { oldId: id });
      return Icon.create({
        name,
        fontClass,
        tags,
        code: canUseCodes[index],
        path,
        createTime,
        applyTime: new Date(),
        status: iconStatus.RESOLVED,
        oldId: id,
        uploader: userId,
      }, {
        transaction,
      });
    })
    .then((data) => {
      idList[index] = idList[index] || {};
      Object.assign(idList[index], { newId: +data.id });
      // 在 repoVersion 表中关联上新上传的图标和大库
      return RepoVersion.create({
        repositoryId: existingIcon['repositories.id'],
        version: '0.0.0',
        iconId: +data.id,
      }, {
        transaction,
      });
    })
    // 记录旧图标对应的新图标的 id，方便系统占用图标关联查询
    .then(() => Icon.update({
      newId: idList[index].newId,
    }, {
      where: { id: idList[index].oldId },
      transaction,
    })));
    const newIconInfo = newCodes.map(code => Icon.create({
      name: '系统占用',
      code: parseInt(+code.code, 10),
      path: disabledCodePath,
      applyTime: code.time || new Date(),
      status: iconStatus.DISABLED,
      uploader: userId,
      description: isString(code.description) ? code.description : JSON.stringify(code.description),
    }, {
      transaction,
    }));
    return Promise
      .all([...existingIconInfo, ...newIconInfo])
      .then(() => {
        const log = {
          params: {
            code: _codes.map(item => {
              const code = item.code;
              return { code };
            }),
          },
          type: 'DISABLED_CODE_ADD',
          loggerId: 0,
        };
        return _codes.length ? logRecorder(log, transaction, userId) : null;
      });
  });
  yield t;

  this.state.respond = yield Icon.findAll({
    where: { status: iconStatus.DISABLED },
    order: 'code ASC',
  });
  yield next;
}

export function *unSetDisabledCode(next) {
  const { iconId } = this.params;
  const icon = yield Icon.findOne({
    where: { id: iconId, status: iconStatus.DISABLED },
  });

  invariant(icon && icon.path, `没有找到 id 为 ${iconId} 的系统占用编码`);

  const { path } = icon;
  if (path === disabledCodePath) {
    // 系统占用图标对应的数据直接删除
    yield Icon.destroy({
      where: { id: iconId, status: iconStatus.DISABLED },
    });
  } else {
    // 对有效数据进行恢复
    yield Icon.update({
      applyTime: new Date(),
      status: iconStatus.RESOLVED,
      description: null,
    }, {
      where: { id: iconId, status: iconStatus.DISABLED },
    });
  }
  this.state.respond = yield Icon.findAll({
    where: { status: iconStatus.DISABLED },
    order: 'code ASC',
  });
  yield next;
}

// 从 GitHub 上拉取
export function *fetchDisabledCode(next) {
  const gitUrl = 'https://raw.githubusercontent.com/YMFE/yicon-problem-code/master/index.json';
  const data = yield axios.get(gitUrl).then(res => res.data);
  this.state.respond = data;
  yield next;
}

export function *updateCodeDescription(next) {
  const { iconId, description } = this.param;
  const { mobile, os, other } = isString(description)
    ? JSON.parse(description)
    : description || {};
  invariant(mobile.length < 100, '机型信息字段过长，请删减');
  invariant(os.length < 100, '系统信息字段过长，请删减');
  invariant(other.length < 2000, '其他信息字段过长，请删减');
  yield Icon.update({
    description,
  }, { where: { id: iconId } });
  this.state.respond = yield Icon.findAll({
    where: { status: iconStatus.DISABLED },
    order: 'code ASC',
  });
  yield next;
}
